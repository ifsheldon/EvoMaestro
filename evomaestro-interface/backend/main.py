import asyncio
import json
import logging
import os
import re
import sqlite3
import subprocess
import tempfile
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import markdown
import yaml
from backend.datasets import GUIDE_ID, Dataset
from backend.public_demo import PublicDemoPolicy
from fastapi import (
    FastAPI,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from shinka.database import DatabaseConfig, ProgramDatabase
from shinka.interactive.interactive_db import CommandType, InteractiveDatabase
from shinka.interactive.payload_schemas import (
    MergePayload,
    SetTargetPayload,
    SuggestPayload,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="ShinkaEvolve Visualization API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all. In prod, restrict.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
SEARCH_ROOT = os.environ.get("SHINKA_SEARCH_ROOT", os.getcwd())
CACHE_EXPIRATION_SECONDS = 5
db_cache: Dict[str, Tuple[float, Any]] = {}

logger.info("Search root: %s", SEARCH_ROOT)


GUIDE_DB_PATH = Path(
    os.environ.get(
        "EVOLVIS_GUIDE_DB",
        str(
            Path(__file__).resolve().parents[2] / "datasets/mock-guide/programs.sqlite"
        ),
    )
)
PUBLIC_DEMO: PublicDemoPolicy | None = None


def configure_public_demo(database: Path, callback_token: str) -> None:
    """Enable an explicitly configured anonymous mock deployment at startup."""
    global PUBLIC_DEMO
    PUBLIC_DEMO = PublicDemoPolicy.create(
        database, Path(SEARCH_ROOT), GUIDE_DB_PATH, callback_token
    )


def _dataset(db_path: str) -> Dataset:
    """Resolve a public dataset identity against the configured roots."""
    if PUBLIC_DEMO is not None:
        return PUBLIC_DEMO.resolve(db_path)
    return Dataset.resolve(db_path, Path(SEARCH_ROOT), GUIDE_DB_PATH)


def _get_actual_db_path(db_path: str) -> str:
    """Return the canonical path of an authorized dataset."""
    return str(_dataset(db_path).path)


def _artifact(database: str, relative: str) -> Path:
    """Resolve a run sidecar, enforcing confinement in public deployments."""
    path = Path(database)
    if PUBLIC_DEMO is not None:
        return PUBLIC_DEMO.sidecar(path, Path(relative))
    return path.parent / relative


def _meta_artifact(database: str, generation: int) -> Path:
    """Locate a numeric-generation summary in either supported run directory."""
    filename = f"meta_{generation}.txt"
    path = _artifact(database, filename)
    if not path.is_file():
        path = _artifact(database, f"meta/{filename}")
    if not path.is_file():
        raise HTTPException(404, "Meta file not found")
    return path


@app.middleware("http")
async def protect_guide_dataset(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Reject guide mutations before any handler opens a writable connection."""
    # Runner callbacks broadcast notifications; they do not write a database.
    if (
        request.method in {"POST", "PUT", "PATCH", "DELETE"}
        and request.url.path != "/api/callback"
    ):
        try:
            body = await request.json()
        except (ValueError, UnicodeDecodeError):
            body = None
        if isinstance(body, dict) and isinstance(body.get("db_path"), str):
            try:
                _dataset(body["db_path"]).require_writable()
            except HTTPException as exc:
                return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    return await call_next(request)


@app.get("/dataset")
async def get_dataset(db_path: str) -> dict[str, object]:
    """Describe the selected dataset's role and supported operations."""
    return _dataset(db_path).describe(db_path)


@app.get("/maestro_context")
async def get_maestro_context(db_path: str) -> dict[str, str]:
    """Authorize Maestro against the canonical dataset before any model call."""
    if PUBLIC_DEMO is not None:
        raise HTTPException(403, "Maestro Chat is disabled in the public demo")
    return {"results_dir": str(_dataset(db_path).maestro_directory())}


def _guide_client_path() -> str:
    """Return a public identity for the independently loaded guide fixture."""
    root = Path(SEARCH_ROOT).resolve()
    guide = GUIDE_DB_PATH.resolve()
    if guide.is_relative_to(root):
        relative = guide.relative_to(root)
        return str(relative) if len(relative.parts) >= 3 else f"{root.name}/{relative}"
    return GUIDE_ID


@app.get("/guide_dataset")
async def get_guide_dataset() -> dict[str, object]:
    """Resolve the guide independently of the selected run or search root."""
    return _dataset(GUIDE_ID).describe(_guide_client_path())


@app.get("/list_databases")
async def list_databases():
    """List selectable databases, excluding the registered guide fixture."""
    if PUBLIC_DEMO is not None:
        return PUBLIC_DEMO.listing()
    logger.info("Searching for DBs in: %s", SEARCH_ROOT)
    db_files = []
    date_pattern = re.compile(r"_(\d{8}_\d{6})")

    task_name = os.path.basename(SEARCH_ROOT)

    if os.path.exists(SEARCH_ROOT):
        for root, _, files in os.walk(SEARCH_ROOT):
            for f in files:
                if f.lower().endswith((".db", ".sqlite")):
                    full_path = os.path.join(root, f)
                    if Path(full_path).resolve() == GUIDE_DB_PATH.resolve():
                        continue
                    client_path = os.path.relpath(full_path, SEARCH_ROOT)
                    display_name = f"{Path(f).stem} - {Path(client_path).parent}"

                    # Extract date for sorting
                    sort_key = "0"
                    match = date_pattern.search(client_path)
                    if match:
                        sort_key = match.group(1)

                    path_parts = client_path.split("/")
                    if len(path_parts) < 3:
                        modified_client_path = f"{task_name}/{client_path}"
                    else:
                        modified_client_path = client_path

                    db_files.append(
                        {
                            "path": modified_client_path,
                            "name": display_name,
                            "sort_key": sort_key,
                            "actual_path": client_path,
                        }
                    )

    # Sort by date, newest first
    db_files.sort(key=lambda x: x.get("sort_key", "0"), reverse=True)

    return db_files


@app.get("/get_programs")
async def get_programs(
    db_path: str,
    timestamp_check: bool = Query(False),
):
    """Fetch all programs from a given database file.

    If timestamp_check is True, return a lightweight payload with the
    latest program timestamp from the database to support auto-refresh checks.
    """
    actual_db_path = _get_actual_db_path(db_path)

    abs_db_path = os.path.join(SEARCH_ROOT, actual_db_path)
    if not os.path.exists(abs_db_path):
        raise HTTPException(
            status_code=404, detail=f"Database file not found: {actual_db_path}"
        )

    if timestamp_check:
        db = None
        try:
            config = DatabaseConfig(db_path=abs_db_path)
            db = ProgramDatabase(config, read_only=True)
            db.cursor.execute("SELECT MAX(timestamp) FROM programs")
            max_timestamp = db.cursor.fetchone()[0]
            return {
                "last_modified_timestamp": max_timestamp or 0,
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        finally:
            if db and hasattr(db, "close"):
                try:
                    db.close()
                except Exception:
                    pass

    # Check cache
    if db_path in db_cache:
        last_fetch_time, cached_data = db_cache[db_path]
        if time.time() - last_fetch_time < CACHE_EXPIRATION_SECONDS:
            return cached_data

    max_retries = 5
    delay = 0.1

    for i in range(max_retries):
        db = None
        try:
            config = DatabaseConfig(db_path=abs_db_path)
            db = ProgramDatabase(config, read_only=True)

            if db.cursor:
                db.cursor.execute("PRAGMA busy_timeout = 10000;")

            programs = db.get_all_programs()
            programs_dict = [p.to_dict() for p in programs]

            # Handle NaN/Inf in JSON
            # FastAPI handles JSON serialization, but standard json doesn't like NaN.
            # We'll let FastAPI handle it but might need a custom encoder if it fails.
            # Actually, FastAPI/Pydantic/Starlette usually handle standard types.
            # If NaN is present, it might produce null or throw error depending on config.
            # We'll replace NaN with None for safety if needed, but let's try direct first.

            # Update cache
            db_cache[db_path] = (time.time(), programs_dict)
            return programs_dict

        except (sqlite3.OperationalError, sqlite3.DatabaseError) as e:
            if "database is locked" in str(e).lower() or "busy" in str(e).lower():
                if i < max_retries - 1:
                    time.sleep(delay)
                    delay = min(delay * 1.5, 2.0)
                    continue
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
        finally:
            if db and hasattr(db, "close"):
                try:
                    db.close()
                except Exception:
                    pass

    raise HTTPException(status_code=503, detail="Database busy")


@app.get("/get_meta_files")
async def get_meta_files(db_path: str):
    actual_db_path = _get_actual_db_path(db_path)
    abs_db_path = os.path.join(SEARCH_ROOT, actual_db_path)
    db_dir = os.path.dirname(abs_db_path)

    if not os.path.exists(db_dir):
        raise HTTPException(status_code=404, detail="Database directory not found")

    meta_files = []
    try:
        # Check both db_dir and db_dir/meta/ for meta files
        search_dirs = [db_dir]
        meta_subdir = os.path.join(db_dir, "meta")
        if os.path.isdir(meta_subdir):
            if PUBLIC_DEMO is not None and Path(meta_subdir).is_symlink():
                raise HTTPException(403, "Dataset artifact must not be a symbolic link")
            search_dirs.append(meta_subdir)

        for search_dir in search_dirs:
            for file in os.listdir(search_dir):
                if file.startswith("meta_") and file.endswith(".txt"):
                    gen_str = file[5:-4]
                    try:
                        generation = int(gen_str)
                        artifact = _artifact(
                            abs_db_path,
                            str(Path(search_dir, file).relative_to(db_dir)),
                        )
                        meta_files.append(
                            {
                                "generation": generation,
                                "filename": file,
                                "path": (
                                    str(artifact.relative_to(db_dir))
                                    if PUBLIC_DEMO is not None
                                    else str(artifact)
                                ),
                            }
                        )
                    except ValueError:
                        continue
        meta_files.sort(key=lambda x: x["generation"])
        return meta_files
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/get_meta_content")
async def get_meta_content(db_path: str, generation: int = Query(ge=0)):
    actual_db_path = _get_actual_db_path(db_path)
    abs_db_path = os.path.join(SEARCH_ROOT, actual_db_path)
    meta_filename = f"meta_{generation}.txt"
    meta_file_path = _meta_artifact(abs_db_path, generation)

    try:
        with open(meta_file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {
            "generation": int(generation),
            "filename": meta_filename,
            "content": content,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/experiment_config")
async def get_experiment_config(db_path: str):
    """Return experiment-level metadata (task description, results dir, language).

    Reads ``experiment_config.yaml`` from the same directory as the database
    file.  Returns sensible defaults when the file is missing.
    """
    actual_db_path = _get_actual_db_path(db_path)
    abs_db_path = os.path.realpath(os.path.join(SEARCH_ROOT, actual_db_path))
    db_dir = os.path.dirname(abs_db_path)

    config_path = _artifact(abs_db_path, "experiment_config.yaml")

    task_sys_msg = ""
    results_dir = db_dir
    language = "python"
    uses_custom_review_prioritization = False
    num_islands = 1

    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f) or {}
            evo = cfg.get("evolution_config", {})
            db_cfg = cfg.get("database_config", {})
            task_sys_msg = evo.get("task_sys_msg", "")
            language = evo.get("language", "python")
            uses_custom_review_prioritization = bool(
                evo.get("review_prioritization_function_path", "")
            )
            num_islands = db_cfg.get("num_islands", 1)
            # Always use db_dir as results_dir: the YAML value may be
            # relative or from a different machine.
            cfg_results_dir = evo.get("results_dir", "") or cfg.get(
                "results_directory", ""
            )
            if (
                cfg_results_dir
                and os.path.isabs(cfg_results_dir)
                and os.path.isdir(cfg_results_dir)
            ):
                results_dir = cfg_results_dir
            else:
                results_dir = db_dir
        except Exception as e:
            logger.warning("Failed to read experiment_config.yaml: %s", e)

    if PUBLIC_DEMO is not None:
        # Chat is disabled, so the browser needs no host working-directory path.
        results_dir = ""
    return {
        "task_sys_msg": task_sys_msg,
        "results_dir": results_dir,
        "language": language,
        "uses_custom_review_prioritization": uses_custom_review_prioritization,
        "num_islands": num_islands,
    }


# PDF Generation helpers (simplified/copied from visualization.py)
def _fix_line_breaks(content: str) -> str:
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    lines = content.split("\n")
    result_lines = []
    i = 0
    while i < len(lines):
        current_line = lines[i].strip()
        result_lines.append(current_line)
        if i < len(lines) - 1:
            next_line = lines[i + 1].strip()
            if (
                current_line
                and next_line
                and len(current_line) > 30
                and current_line.endswith((".", "!", "?", ";"))
                and next_line[0].isupper()
                and not next_line.startswith(("#", "-", "*", "+"))
                and not re.match(r"^\*\*\w+:\*\*", next_line)
            ):
                result_lines.append("")
        i += 1
    return "\n".join(result_lines)


def _add_program_boxes_html(html_content: str) -> str:
    program_pattern = r"(<p><strong>Program Name:[^<]*</strong>[\s\S]*?</p>)"

    def wrap_program_html(match):
        program_html = match.group(1).strip()
        return f'<div class="program-box">{program_html}</div>'

    return re.sub(
        program_pattern, wrap_program_html, html_content, flags=re.MULTILINE | re.DOTALL
    )


def _generate_pdf(content: str, generation: str) -> Optional[bytes]:
    # This function needs to handle the HTML generation and then use wkhtmltopdf or pandoc
    # For now, we'll try to replicate the logic but it might fail if tools aren't installed.
    # We will return None if it fails, and the endpoint will handle fallback (serve text or error).

    try:
        processed_content = _fix_line_breaks(content)
        try:
            html_content = markdown.markdown(
                processed_content, extensions=["extra", "nl2br"]
            )
        except Exception:
            html_content = markdown.markdown(processed_content, extensions=["extra"])
            html_content = html_content.replace("\n", "<br>\n")

        html_content = _add_program_boxes_html(html_content)

        # We skip logo for now as it's complex to locate relative to this file

        html_full = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Meta Generation {generation}</title>
    <style>
        @media print {{ @page {{ margin: 2cm; size: A4; }} body {{ font-size: 12pt; }} }}
        body {{ font-family: 'Times New Roman', Times, serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }}
        h1 {{ color: #2c3e50; border-bottom: 2px solid #e74c3c; padding-bottom: 10px; margin-top: 0; }}
        pre {{ background-color: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; border: 1px solid #e9ecef; font-family: 'Courier New', monospace; font-size: 11pt; }}
        code {{ background-color: #f8f9fa; padding: 2px 4px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 90%; }}
        .program-box {{ border: 2px solid #e74c3c; border-radius: 10px; margin: 0.8em 0; padding: 0.1em 0.8em; background-color: #f8f9fa; page-break-inside: avoid; }}
    </style>
</head>
<body>
    <div class="header-container">
        <h1 class="header-title">ShinkaEvolve Meta-Scratchpad: {generation}</h1>
    </div>
    {html_content}
</body>
</html>"""

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".html", delete=False
        ) as html_file:
            html_file.write(html_full)
            html_file_path = html_file.name

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as pdf_file:
            pdf_file_path = pdf_file.name

        # Try wkhtmltopdf
        try:
            subprocess.run(
                ["wkhtmltopdf", "--page-size", "A4", html_file_path, pdf_file_path],
                capture_output=True,
                timeout=30,
                check=True,
            )
            with open(pdf_file_path, "rb") as f:
                pdf_bytes = f.read()
            os.unlink(html_file_path)
            os.unlink(pdf_file_path)
            return pdf_bytes
        except Exception:
            # Try pandoc
            try:
                subprocess.run(
                    ["pandoc", html_file_path, "-o", pdf_file_path],
                    capture_output=True,
                    timeout=30,
                    check=True,
                )
                with open(pdf_file_path, "rb") as f:
                    pdf_bytes = f.read()
                os.unlink(html_file_path)
                os.unlink(pdf_file_path)
                return pdf_bytes
            except Exception:
                pass

        # Cleanup if failed
        if os.path.exists(html_file_path):
            os.unlink(html_file_path)
        if os.path.exists(pdf_file_path):
            os.unlink(pdf_file_path)

    except Exception as e:
        logger.error("PDF generation error: %s", e)

    return None


@app.get("/download_meta_pdf")
async def download_meta_pdf(db_path: str, generation: int = Query(ge=0)):
    actual_db_path = _get_actual_db_path(db_path)
    abs_db_path = os.path.join(SEARCH_ROOT, actual_db_path)
    meta_file_path = _meta_artifact(abs_db_path, generation)

    with open(meta_file_path, "r", encoding="utf-8") as f:
        content = f.read()

    pdf_bytes = _generate_pdf(content, str(generation)) if PUBLIC_DEMO is None else None

    if pdf_bytes:
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="meta_{generation}.pdf"'
            },
        )
    else:
        # Fallback to text
        formatted_content = f"Meta Generation {generation}\n{'=' * 50}\n\n{content}"
        return Response(
            content=formatted_content,
            media_type="text/plain",
            headers={
                "Content-Disposition": f'attachment; filename="meta_{generation}.txt"'
            },
        )


# ---------------------------------------------------------------------------
# Interactive evolution endpoints
# ---------------------------------------------------------------------------


def _get_interactive_db(
    db_path: str, *, read_only: bool = False
) -> InteractiveDatabase:
    """Get an InteractiveDatabase for a given db_path."""
    actual_db_path = _get_actual_db_path(db_path)
    abs_db_path = os.path.join(SEARCH_ROOT, actual_db_path)
    if not os.path.exists(abs_db_path):
        raise HTTPException(
            status_code=404, detail=f"Database not found: {actual_db_path}"
        )
    if not read_only:
        _dataset(db_path).require_writable()
    return InteractiveDatabase(abs_db_path, read_only=read_only)


class SuggestRequest(SuggestPayload):
    """Validate suggestion payloads at the HTTP boundary before queueing."""

    db_path: str


class MergeRequest(MergePayload):
    """Validate merge payloads at the HTTP boundary before queueing."""

    db_path: str


class CommandRequest(BaseModel):
    db_path: str


@app.get("/api/run/status")
async def get_run_status(db_path: str):
    """Get the current interactive run status."""
    interactive_db = _get_interactive_db(db_path, read_only=True)
    status = interactive_db.read_status()
    generation_backend_heartbeat_at = interactive_db.read_heartbeat() or 0
    if status is None:
        return {
            "run_state": "unknown",
            "generation": 0,
            "best_score": 0.0,
            "queued_jobs": 0,
            "total_programs": 0,
            "target_generations": 0,
            "is_resuming": False,
            "updated_at": 0,
            "generation_backend_heartbeat_at": generation_backend_heartbeat_at,
        }
    return {
        "run_state": status.run_state,
        "generation": status.generation,
        "best_score": status.best_score,
        "queued_jobs": status.queued_jobs,
        "total_programs": status.total_programs,
        "target_generations": status.target_generations,
        "is_resuming": status.is_resuming,
        "updated_at": status.updated_at,
        "generation_backend_heartbeat_at": generation_backend_heartbeat_at,
    }


@app.post("/api/run/pause")
async def pause_run(req: CommandRequest):
    """Pause the evolution run."""
    interactive_db = _get_interactive_db(req.db_path)
    cmd_id = interactive_db.push_command(CommandType.PAUSE)
    return {"status": "ok", "command_id": cmd_id}


@app.post("/api/run/resume")
async def resume_run(req: CommandRequest):
    """Resume a paused evolution run."""
    interactive_db = _get_interactive_db(req.db_path)
    cmd_id = interactive_db.push_command(CommandType.RESUME)
    return {"status": "ok", "command_id": cmd_id}


@app.post("/api/run/stop")
async def stop_run(req: CommandRequest):
    """Gracefully stop the evolution run."""
    interactive_db = _get_interactive_db(req.db_path)
    cmd_id = interactive_db.push_command(CommandType.STOP)
    return {"status": "ok", "command_id": cmd_id}


@app.post("/api/run/start")
async def start_run(req: CommandRequest):
    """Give greenlight to start the evolution run."""
    interactive_db = _get_interactive_db(req.db_path)
    cmd_id = interactive_db.push_command(CommandType.START)
    return {"status": "ok", "command_id": cmd_id}


class SetTargetRequest(SetTargetPayload):
    """Apply the runner's existing generation limits to HTTP requests."""

    db_path: str


@app.post("/api/run/set_target")
async def set_target(req: SetTargetRequest):
    """Dynamically change the target number of generations."""
    interactive_db = _get_interactive_db(req.db_path)
    cmd_id = interactive_db.push_command(
        CommandType.SET_TARGET,
        payload=SetTargetPayload(target_generations=req.target_generations),
    )
    return {"status": "ok", "command_id": cmd_id}


@app.post("/api/run/step")
async def step_run(req: CommandRequest):
    """Generate one more node then auto-pause."""
    interactive_db = _get_interactive_db(req.db_path)
    cmd_id = interactive_db.push_command(CommandType.STEP)
    return {"status": "ok", "command_id": cmd_id}


_ACCEPTING_STATES = {"running", "paused", "idle", "waiting_for_start"}
_STALE_STATUS_SECONDS = (
    30  # if status wasn't updated within this window, runner is likely dead
)


def _assert_runner_alive(interactive_db: InteractiveDatabase) -> None:
    """Raise HTTPException if the evolution runner is not accepting commands.

    The runner is considered alive if its last reported state is one of
    ``running``, ``paused``, or ``idle`` and it has refreshed its heartbeat
    recently (within ``_STALE_STATUS_SECONDS``).
    """
    status = interactive_db.read_status()
    if status is None:
        raise HTTPException(
            status_code=409,
            detail="No evolution runner is connected. Start the evolution script first.",
        )
    if status.run_state not in _ACCEPTING_STATES:
        raise HTTPException(
            status_code=409,
            detail=f"The evolution runner is in '{status.run_state}' state and is not accepting commands.",
        )
    heartbeat_at = interactive_db.read_heartbeat() or status.updated_at
    age = time.time() - heartbeat_at
    if age > _STALE_STATUS_SECONDS:
        raise HTTPException(
            status_code=409,
            detail=(
                f"The evolution runner has not reported a heartbeat for {int(age)}s. "
                "It may have crashed or been terminated."
            ),
        )


@app.post("/api/run/suggest")
async def suggest(req: SuggestRequest):
    """Submit an expert suggestion for a node."""
    interactive_db = _get_interactive_db(req.db_path)
    _assert_runner_alive(interactive_db)
    cmd_id = interactive_db.push_command(
        CommandType.SUGGEST,
        payload=SuggestPayload(
            parent_id=req.parent_id,
            prompt=req.prompt,
            patch_type=req.patch_type,
        ),
    )
    return {"status": "ok", "command_id": cmd_id}


@app.post("/api/run/merge")
async def merge(req: MergeRequest):
    """Submit an expert merge request for 2-3 nodes."""
    if len(req.parent_ids) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 parent_ids")
    if len(req.parent_ids) > 3:
        raise HTTPException(status_code=400, detail="At most 3 parent_ids supported")
    interactive_db = _get_interactive_db(req.db_path)
    _assert_runner_alive(interactive_db)
    cmd_id = interactive_db.push_command(
        CommandType.MERGE,
        payload=MergePayload(
            parent_ids=req.parent_ids,
            prompt=req.prompt,
            patch_type=req.patch_type,
        ),
    )
    return {"status": "ok", "command_id": cmd_id}


class BanRequest(BaseModel):
    db_path: str
    program_ids: list[str]


@app.post("/api/run/ban")
async def ban_programs(req: BanRequest):
    """Ban one or more programs from being used as parents or inspirations."""
    interactive_db = _get_interactive_db(req.db_path)
    for pid in req.program_ids:
        interactive_db.ban_program(pid)
    return {"status": "ok", "banned": req.program_ids}


@app.post("/api/run/unban")
async def unban_programs(req: BanRequest):
    """Remove the ban from one or more programs."""
    interactive_db = _get_interactive_db(req.db_path)
    for pid in req.program_ids:
        interactive_db.unban_program(pid)
    return {"status": "ok", "unbanned": req.program_ids}


@app.get("/api/run/banned")
async def get_banned(db_path: str):
    """Get all currently banned program IDs."""
    interactive_db = _get_interactive_db(db_path, read_only=True)
    return {"banned_ids": list(interactive_db.get_banned_ids())}


@app.get("/api/run/commands")
async def get_commands(db_path: str, limit: int = 20):
    """Get recent interactive commands and their statuses."""
    interactive_db = _get_interactive_db(db_path, read_only=True)
    commands = interactive_db.get_recent_commands(limit=limit)
    return [
        {
            "id": c.id,
            "command_type": c.command_type.value,
            "payload": c.payload.model_dump()
            if isinstance(c.payload, BaseModel)
            else c.payload,
            "status": c.status.value,
            "created_at": c.created_at,
            "processed_at": c.processed_at,
            "result": c.result,
        }
        for c in commands
    ]


# ---------------------------------------------------------------------------
# Expert Review Prioritization status
# ---------------------------------------------------------------------------


@app.get("/api/review_prioritization/status")
async def get_review_prioritization_status(db_path: str):
    """Return prioritized programs and custom-function load errors."""
    actual_db_path = _get_actual_db_path(db_path)
    abs_db_path = os.path.join(SEARCH_ROOT, actual_db_path)

    result: Dict[str, Any] = {"prioritized_programs": [], "error": None}

    # Check for a custom-function error next to the database.
    error_file = _artifact(abs_db_path, "review_prioritization_error.json")
    if os.path.exists(error_file):
        try:
            with open(error_file) as f:
                err_data = json.load(f)
                result["error"] = err_data.get("error")
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            logger.warning(
                "Could not read review-prioritization error file %s: %s",
                error_file,
                exc,
            )

    # Query programs prioritized for review.
    try:
        conn = sqlite3.connect(
            Path(abs_db_path).as_uri() + "?mode=ro", uri=True, timeout=5
        )
        try:
            conn.execute("PRAGMA busy_timeout=5000")
            cur = conn.execute(
                "SELECT id, review_priority_level, review_priority_data, combined_score, generation, timestamp "
                "FROM programs WHERE review_priority_level != 'none' "
                "ORDER BY timestamp DESC LIMIT 50"
            )
            result["prioritized_programs"] = [
                {
                    "id": row[0],
                    "review_priority_level": row[1],
                    "review_priority_data": json.loads(row[2]) if row[2] else {},
                    "combined_score": row[3],
                    "generation": row[4],
                    "timestamp": row[5],
                }
                for row in cur.fetchall()
            ]
        finally:
            conn.close()
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not query review priorities: {exc}",
        ) from exc

    return result


# ---------------------------------------------------------------------------
# Expert Review Prioritization settings
# ---------------------------------------------------------------------------


class ReviewPrioritizationSettingsRequest(BaseModel):
    db_path: str
    mode: str  # "score_change" or "dissimilarity"
    score_change_moderate: float = 0.15
    score_change_high: float = 0.30
    dissimilarity_moderate: float = 0.3
    dissimilarity_high: float = 0.5
    dissimilarity_embedding: str = "code"  # "code" or "reasoning"


@app.get("/api/run/review_prioritization_settings")
async def get_review_prioritization_settings(db_path: str):
    """Return saved prioritization settings and custom-function status."""
    actual_db_path = _get_actual_db_path(db_path)
    abs_db_path = os.path.join(SEARCH_ROOT, actual_db_path)

    if not os.path.exists(abs_db_path):
        raise HTTPException(
            status_code=404, detail=f"Database not found: {actual_db_path}"
        )

    # Check whether a custom prioritization function is active.
    config_path = _artifact(abs_db_path, "experiment_config.yaml")
    is_custom = False
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = yaml.safe_load(f) or {}
            evo = cfg.get("evolution_config", {})
            is_custom = bool(evo.get("review_prioritization_function_path", ""))
        except Exception as e:
            logger.warning(
                "Failed to inspect review-prioritization configuration: %s",
                e,
            )

    # Read saved settings
    defaults = {
        "mode": "score_change",
        "score_change_moderate": 0.15,
        "score_change_high": 0.30,
        "dissimilarity_moderate": 0.3,
        "dissimilarity_high": 0.5,
        "dissimilarity_embedding": "code",
    }

    try:
        saved = (
            _get_interactive_db(
                db_path, read_only=True
            ).read_review_prioritization_settings()
            or {}
        )
        result = {**defaults, **saved}
    except (sqlite3.Error, json.JSONDecodeError) as exc:
        logger.warning(
            "Could not read review-prioritization settings for %s: %s",
            db_path,
            exc,
        )
        result = defaults

    result["is_custom"] = is_custom
    return result


@app.post("/api/run/review_prioritization_settings")
async def update_review_prioritization_settings(
    req: ReviewPrioritizationSettingsRequest,
):
    """Save settings and recompute priorities from cached metrics."""
    if req.mode not in ("score_change", "dissimilarity"):
        raise HTTPException(
            status_code=400, detail="mode must be 'score_change' or 'dissimilarity'"
        )
    if req.dissimilarity_embedding not in ("code", "reasoning"):
        raise HTTPException(
            status_code=400,
            detail="dissimilarity_embedding must be 'code' or 'reasoning'",
        )

    actual_db_path = _get_actual_db_path(req.db_path)
    abs_db_path = os.path.join(SEARCH_ROOT, actual_db_path)

    if not os.path.exists(abs_db_path):
        raise HTTPException(
            status_code=404, detail=f"Database not found: {actual_db_path}"
        )

    settings_to_save = {
        "mode": req.mode,
        "score_change_moderate": req.score_change_moderate,
        "score_change_high": req.score_change_high,
        "dissimilarity_moderate": req.dissimilarity_moderate,
        "dissimilarity_high": req.dissimilarity_high,
        "dissimilarity_embedding": req.dissimilarity_embedding,
    }

    try:
        _get_interactive_db(req.db_path).write_review_prioritization_settings(
            settings_to_save
        )

        conn = sqlite3.connect(abs_db_path, timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=10000")
        try:
            # Read cached prioritization metrics with score context.
            try:
                cur = conn.execute(
                    "SELECT nc.program_id, nc.score_change, "
                    "nc.dissimilarity_code, nc.dissimilarity_reasoning, "
                    "p.combined_score AS program_score, "
                    "parent.combined_score AS parent_score "
                    "FROM review_priority_metrics nc "
                    "JOIN programs p ON nc.program_id = p.id "
                    "LEFT JOIN programs parent ON p.parent_id = parent.id"
                )
                cache_rows = cur.fetchall()
            except sqlite3.OperationalError:
                # review_priority_metrics table may not exist
                cache_rows = []

            # Apply the selected signal and thresholds.
            updates: List[Tuple[str, str, str]] = []
            counts = {"none": 0, "moderate": 0, "high": 0}

            for row in cache_rows:
                program_id = row[0]
                score_change_val = row[1]
                dissimilarity_code_val = row[2]
                dissimilarity_reasoning_val = row[3]
                program_score = row[4]
                parent_score = row[5]

                if req.mode == "score_change":
                    value = score_change_val
                    high_threshold = req.score_change_high
                    moderate_threshold = req.score_change_moderate
                else:  # dissimilarity
                    if req.dissimilarity_embedding == "reasoning":
                        value = dissimilarity_reasoning_val
                    else:
                        value = dissimilarity_code_val
                    high_threshold = req.dissimilarity_high
                    moderate_threshold = req.dissimilarity_moderate

                if value is None:
                    level = "none"
                elif value >= high_threshold:
                    level = "high"
                elif value >= moderate_threshold:
                    level = "moderate"
                else:
                    level = "none"
                applied_threshold = (
                    high_threshold if level == "high" else moderate_threshold
                )

                # Build the evidence shown when users inspect the assignment.
                if req.mode == "score_change":
                    review_priority_data = {
                        "mode": "score_change",
                        "gain_pct": round(value * 100, 2)
                        if value is not None
                        else None,
                        "parent_score": round(parent_score, 4)
                        if parent_score is not None
                        else None,
                        "program_score": round(program_score, 4)
                        if program_score is not None
                        else None,
                        "reason": f"{value * 100:.1f}% gain (>={applied_threshold * 100:.0f}%)"
                        if value is not None and level != "none"
                        else None,
                    }
                else:
                    emb_label = (
                        "reasoning"
                        if req.dissimilarity_embedding == "reasoning"
                        else "code"
                    )
                    review_priority_data = {
                        "mode": "dissimilarity",
                        "embedding_source": emb_label,
                        "dissimilarity": round(value, 4) if value is not None else None,
                        "reason": f"Min {emb_label} dissimilarity {value:.3f} (>={applied_threshold})"
                        if value is not None and level != "none"
                        else None,
                    }

                updates.append((level, json.dumps(review_priority_data), program_id))
                counts[level] += 1

            # Persist recomputed priorities in one batch.
            if updates:
                conn.executemany(
                    "UPDATE programs SET review_priority_level = ?, review_priority_data = ? WHERE id = ?",
                    updates,
                )
                conn.commit()

            # Invalidate cached program records so the UI sees the new priorities.
            if req.db_path in db_cache:
                del db_cache[req.db_path]
            _last_review_priority_count[req.db_path] = (
                counts["moderate"] + counts["high"]
            )

            return {
                "status": "ok",
                "updated": len(updates),
                "counts": counts,
            }
        finally:
            conn.close()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")


# ---------------------------------------------------------------------------
# Push-based callback endpoint (receives events from the runner)
# ---------------------------------------------------------------------------


@app.post("/api/callback")
async def receive_callback(payload: Dict[str, Any], request: Request):
    """Receive lifecycle events from the evolution runner.

    The runner POSTs ``program.queued`` and ``program.generated`` events
    here.  We resolve the db_path to the WebSocket routing key and
    broadcast the event to all connected frontends.
    """
    event = payload.get("event")
    raw_db_path = payload.get("db_path", "")

    if PUBLIC_DEMO is not None:
        PUBLIC_DEMO.require_callback(request.headers.get("authorization"))
        if not isinstance(raw_db_path, str):
            raise HTTPException(400, "Callback requires a database identity")
        callback_dataset = _dataset(raw_db_path)
        if callback_dataset.path != PUBLIC_DEMO.demo:
            raise HTTPException(
                403, "Runner callbacks require the mutable mock dataset"
            )

    # A fixed guide must not acquire transient nodes from runner notifications.
    try:
        callback_dataset = _dataset(raw_db_path)
    except HTTPException:
        callback_dataset = None
    if callback_dataset is not None and callback_dataset.read_only:
        return {"status": "ignored", "reason": "read-only guide dataset"}

    if event not in ("program.queued", "program.generated"):
        logger.debug("Callback ignored unknown event: %s", event)
        return {"status": "ignored", "reason": f"unknown event: {event}"}

    logger.info("Callback received %s db_path=%r", event, raw_db_path)

    # Resolve the db_path the runner sends to the WS routing key(s).
    # The WS clients may have connected using a task-name-prefixed path
    # (e.g. "my_task/results/.../shinka.db") while the runner sends the
    # absolute or relative path.  Try broadcasting to all plausible keys.
    task_name = os.path.basename(SEARCH_ROOT)
    candidate_keys = {raw_db_path, f"{task_name}/{raw_db_path}"}

    # Also try stripping the SEARCH_ROOT prefix if the runner sent an
    # absolute path.
    abs_search = os.path.abspath(SEARCH_ROOT)
    abs_db = os.path.abspath(raw_db_path) if os.path.isabs(raw_db_path) else ""
    if abs_db.startswith(abs_search):
        rel = os.path.relpath(abs_db, abs_search)
        candidate_keys.add(rel)
        candidate_keys.add(f"{task_name}/{rel}")

    if event == "program.queued":
        msg = {
            "type": "program.queued",
            "program_id": payload.get("program_id"),
            "parent_id": payload.get("parent_id"),
            "generation": payload.get("generation"),
            "code": payload.get("code", ""),
            "code_diff": payload.get("code_diff"),
            "timestamp": payload.get("timestamp"),
            "island_idx": payload.get("island_idx"),
            "metadata": payload.get("metadata"),
            "archive_inspiration_ids": payload.get("archive_inspiration_ids", []),
            "top_k_inspiration_ids": payload.get("top_k_inspiration_ids", []),
        }
    else:  # program.generated
        program_data = payload.get("program", {})
        msg = {
            "type": "program.generated",
            "program": program_data,
        }
        # Invalidate REST cache so the next /get_programs returns fresh data
        for key in list(db_cache.keys()):
            if key in candidate_keys:
                del db_cache[key]

    # Broadcast to all matching WS routing keys
    sent = False
    ws_keys = set(ws_manager.active_connections.keys())
    for key in candidate_keys:
        if key in ws_manager.active_connections:
            n = len(ws_manager.active_connections[key])
            await ws_manager.broadcast(key, msg)
            sent = True
            logger.info("Callback broadcast %s → key=%r (%d clients)", event, key, n)
            # Update program count tracker to prevent fallback polling
            # from sending a duplicate programs.updated
            if event == "program.generated":
                _last_program_count[key] = _last_program_count.get(key, 0) + 1

    if not sent:
        logger.debug(
            "Callback NO match — candidates=%s, active_ws_keys=%s",
            candidate_keys,
            ws_keys,
        )
    return {"status": "broadcast" if sent else "no_subscribers"}


# ---------------------------------------------------------------------------
# WebSocket for real-time push updates
# ---------------------------------------------------------------------------


class ConnectionManager:
    """Manages WebSocket connections for push-based updates."""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, db_path: str):
        await websocket.accept()
        if db_path not in self.active_connections:
            self.active_connections[db_path] = set()
        self.active_connections[db_path].add(websocket)

    def disconnect(self, websocket: WebSocket, db_path: str):
        if db_path in self.active_connections:
            self.active_connections[db_path].discard(websocket)
            if not self.active_connections[db_path]:
                del self.active_connections[db_path]

    async def broadcast(self, db_path: str, message: dict):
        if db_path not in self.active_connections:
            return
        dead: List[WebSocket] = []
        for ws in self.active_connections[db_path]:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active_connections[db_path].discard(ws)


ws_manager = ConnectionManager()

# Track last known program count per db_path for change detection
_last_program_count: Dict[str, int] = {}
_last_status_hash: Dict[str, str] = {}
_last_review_priority_count: Dict[str, int] = {}


def _ws_poll_db(
    abs_db_path: str,
    prev_status_hash: str,
    prev_review_priority_count: int,
) -> Dict[str, Any]:
    """Synchronous database polling for the WebSocket push loop.

    Runs in a thread via ``asyncio.to_thread`` so that the event loop
    stays responsive to ``CancelledError`` during server shutdown.
    """
    result: Dict[str, Any] = {
        "count": -1,
        "max_ts": 0,
        "prioritized_programs": [],
        "review_priority_count": prev_review_priority_count,
        "status": None,
        "status_hash": prev_status_hash,
        "generation_backend_heartbeat_at": 0.0,
    }

    # --- program count & timestamp ---
    try:
        conn = sqlite3.connect(
            Path(abs_db_path).as_uri() + "?mode=ro", uri=True, timeout=2
        )
        try:
            conn.execute("PRAGMA busy_timeout=2000")

            cur = conn.execute("SELECT COUNT(*) FROM programs")
            result["count"] = cur.fetchone()[0]

            cur2 = conn.execute("SELECT MAX(timestamp) FROM programs")
            result["max_ts"] = cur2.fetchone()[0] or 0

            # Priority assignment runs after insertion, so track it separately
            # from the total program count.
            try:
                n_cur = conn.execute(
                    "SELECT COUNT(*) FROM programs WHERE review_priority_level != 'none'"
                )
                current_review_priority_count = n_cur.fetchone()[0]
                result["review_priority_count"] = current_review_priority_count

                if current_review_priority_count > prev_review_priority_count:
                    new_priorities = (
                        current_review_priority_count - prev_review_priority_count
                    )
                    cur3 = conn.execute(
                        "SELECT id, review_priority_level, review_priority_data, "
                        "combined_score, generation "
                        "FROM programs WHERE review_priority_level != 'none' "
                        "ORDER BY timestamp DESC LIMIT ?",
                        (new_priorities,),
                    )
                    for row in cur3.fetchall():
                        prog_id, nlevel, ndata, score, gen = row
                        if nlevel and nlevel != "none":
                            result["prioritized_programs"].append(
                                {
                                    "program_id": prog_id,
                                    "review_priority_level": nlevel,
                                    "review_priority_data": json.loads(ndata)
                                    if ndata
                                    else {},
                                    "combined_score": score,
                                    "generation": gen,
                                }
                            )
            except sqlite3.Error:
                logger.debug(
                    "Could not poll review priorities from %s",
                    abs_db_path,
                    exc_info=True,
                )
        finally:
            conn.close()
    except Exception:
        pass

    # --- interactive status ---
    try:
        interactive_db = InteractiveDatabase(abs_db_path, read_only=True)
        status = interactive_db.read_status()
        generation_backend_heartbeat_at = interactive_db.read_heartbeat() or 0.0
        result["generation_backend_heartbeat_at"] = generation_backend_heartbeat_at
        if status:
            status_hash = (
                f"{status.run_state}:{status.generation}:"
                f"{status.best_score}:{status.queued_jobs}:"
                f"{status.target_generations}:{status.is_resuming}:"
                f"{generation_backend_heartbeat_at:.3f}"
            )
            result["status_hash"] = status_hash
            if status_hash != prev_status_hash:
                result["status"] = {
                    "run_state": status.run_state,
                    "generation": status.generation,
                    "best_score": status.best_score,
                    "queued_jobs": status.queued_jobs,
                    "total_programs": status.total_programs,
                    "target_generations": status.target_generations,
                    "is_resuming": status.is_resuming,
                    "updated_at": status.updated_at,
                    "generation_backend_heartbeat_at": generation_backend_heartbeat_at,
                }
    except Exception:
        pass

    return result


@app.websocket("/ws/{db_path:path}")
async def websocket_endpoint(websocket: WebSocket, db_path: str):
    """WebSocket endpoint for real-time evolution updates.

    Primary updates arrive via POST ``/api/callback`` from the runner.
    This loop is a **fallback** that polls the SQLite database for:
    - Interactive status changes (every ~2 s)
    - Review-priority assignments (every ~5 s)
    - Program count changes      (every ~30 s, safety net)

    All blocking SQLite I/O runs in a thread (``asyncio.to_thread``)
    so the event loop stays responsive to ``CancelledError`` during
    server shutdown (Ctrl-C).
    """
    try:
        _dataset(db_path)
    except HTTPException:
        await websocket.close(code=1008, reason="Dataset is unavailable")
        return
    await ws_manager.connect(websocket, db_path)
    _poll_tick = 0  # counts 2-second ticks

    # Keep a persistent receive task so we detect client disconnect
    # (or server-initiated close during shutdown) immediately.
    receive_task: asyncio.Task[Any] = asyncio.create_task(websocket.receive())

    try:
        while True:
            sleep_task = asyncio.create_task(asyncio.sleep(2))
            done, _ = await asyncio.wait(
                {receive_task, sleep_task},
                return_when=asyncio.FIRST_COMPLETED,
            )

            if receive_task in done:
                # Connection closed (client disconnect or server shutdown)
                sleep_task.cancel()
                break

            # Normal: 2 s elapsed — poll the database
            _poll_tick += 1

            actual_db_path = _get_actual_db_path(db_path)
            abs_db_path = os.path.join(SEARCH_ROOT, actual_db_path)
            if not os.path.exists(abs_db_path):
                continue

            try:
                poll = await asyncio.to_thread(
                    _ws_poll_db,
                    abs_db_path,
                    _last_status_hash.get(db_path, ""),
                    _last_review_priority_count.get(db_path, 0),
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                continue

            # --- broadcast program updates (fallback safety net) ---
            if _poll_tick % 15 == 0:
                prev_count = _last_program_count.get(db_path, 0)
                if poll["count"] > prev_count:
                    _last_program_count[db_path] = poll["count"]
                    await ws_manager.broadcast(
                        db_path,
                        {
                            "type": "programs.updated",
                            "program_count": poll["count"],
                            "last_modified": poll["max_ts"],
                        },
                    )

            # --- broadcast review-priority notifications (every ~10 s) ---
            if _poll_tick % 5 == 0:
                if poll["review_priority_count"] > _last_review_priority_count.get(
                    db_path, 0
                ):
                    _last_review_priority_count[db_path] = poll["review_priority_count"]
                    for prioritized_program in poll["prioritized_programs"]:
                        await ws_manager.broadcast(
                            db_path,
                            {
                                "type": "review_priority.assigned",
                                **prioritized_program,
                            },
                        )

            # --- broadcast status changes ---
            if poll["status"] is not None:
                _last_status_hash[db_path] = poll["status_hash"]
                await ws_manager.broadcast(
                    db_path,
                    {
                        "type": "run.status",
                        **poll["status"],
                    },
                )

    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        receive_task.cancel()
        ws_manager.disconnect(websocket, db_path)
