"""Build fresh mock-demo and immutable mock-guide artifacts without API calls."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from contextlib import closing
from pathlib import Path
from typing import Any

import yaml
from shinka.tools.compat.backfill_review_priorities import backfill
from shinka.tools.compat.repair_reasoning_embeddings import repair_database

REPO = Path(__file__).resolve().parents[2]
FIXTURE = REPO / "evomaestro-interface/src/fixtures/guide-summary.json"


def inventory(root: Path) -> dict[str, str]:
    """Hash source files without SQLite's ephemeral shared-memory index."""
    return {
        str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file() and not path.name.endswith("-shm")
    }


def snapshot(source: Path, output: Path) -> None:
    """Back up a read-only SQLite connection, including committed WAL contents."""
    if output.exists():
        raise FileExistsError(output)
    with (
        closing(
            sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True)
        ) as original,
        closing(sqlite3.connect(output)) as destination,
    ):
        original.backup(destination)
        destination.execute("PRAGMA journal_mode=DELETE")


def portable_text(text: str, source: Path) -> str:
    """Replace known run and repository prefixes in portable artifact text."""
    return text.replace(str(source), "<run>").replace(str(REPO), "<repo>")


def copy_run(source: Path, output: Path) -> None:
    """Copy a sandbox run without caches, backups, or SQLite sidecar files."""
    output.mkdir()
    snapshot(source / "programs.sqlite", output / "programs.sqlite")
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise ValueError("Source contains a symlink")
        relative = path.relative_to(source)
        if not path.is_file() or path.name.startswith("programs.sqlite"):
            continue
        if (
            "__pycache__" in relative.parts
            or path.suffix == ".pyc"
            or ".bak" in path.name
            or path.name == ".DS_Store"
        ):
            continue
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix == ".pkl":
            shutil.copyfile(path, target)
        else:
            target.write_text(portable_text(path.read_text(), source))


def prepare_run(directory: Path, role: str, source: Path) -> dict[str, Any]:
    """Validate the database, add dataset capabilities, and normalize run paths."""
    database = directory / "programs.sqlite"
    with closing(sqlite3.connect(database)) as conn:
        conn.row_factory = sqlite3.Row
        rows = [
            dict(row)
            for row in conn.execute(
                "SELECT * FROM programs ORDER BY generation, timestamp, id"
            )
        ]
        if not rows:
            raise ValueError("Mock dataset is empty")
        roots = [row for row in rows if row["generation"] == 0]
        crosses = [
            row
            for row in rows
            if json.loads(row["metadata"] or "{}").get("patch_type") == "cross"
        ]
        if len(roots) != 5:
            raise ValueError("Expected five initial island nodes")
        if role == "mock-demo" and len(rows) != 5:
            raise ValueError("mock-demo must contain only starting nodes")
        if role == "mock-guide" and (not crosses or len(rows) <= 5):
            raise ValueError("mock-guide needs evolved nodes and a crossover")
        for row in rows:
            metadata = json.loads(row["metadata"] or "{}")
            changed = False
            for key in ("stdout_log", "stderr_log"):
                if isinstance(metadata.get(key), str):
                    old = metadata[key]
                    metadata[key] = portable_text(old, source)
                    changed |= old != metadata[key]
            if changed:
                conn.execute(
                    "UPDATE programs SET metadata=? WHERE id=?",
                    (json.dumps(metadata), row["id"]),
                )
        conn.commit()
        conn.execute("PRAGMA journal_mode=DELETE")
        conn.execute("VACUUM")
        if (
            conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok"
            or conn.execute("PRAGMA foreign_key_check").fetchall()
        ):
            raise ValueError("Mock database integrity check failed")
    if role == "mock-demo":
        # Seed initialization has no review events; fill its derived cache offline.
        backfill(database, metrics_only=True)
    repaired = directory / ".reasoning-cleanup.sqlite"
    reasoning_report = repair_database(database, repaired)
    if reasoning_report["before"]["invalid_vector_count"]:
        raise ValueError(
            "Mock source contains invalid vectors; audit it before preparation"
        )
    repaired.replace(database)
    with closing(sqlite3.connect(database)) as conn:
        conn.row_factory = sqlite3.Row
        after = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM programs")}
        for row in rows:
            for field in row:
                if (
                    field
                    not in {
                        "metadata",
                        "reasoning_embedding_pca_2d",
                        "reasoning_embedding_cluster_id",
                    }
                    and row[field] != after[row["id"]][field]
                ):
                    raise ValueError(f"Program field changed: {field}")
    generation = max(row["generation"] for row in rows)
    manifest: dict[str, Any] = {"role": role, "program_count": len(rows)}
    if role == "mock-guide":
        fixture = json.loads(FIXTURE.read_text())
        meta = directory / "meta" / f"meta_{generation}.txt"
        meta.parent.mkdir(exist_ok=True)
        meta.write_text(
            "# GLOBAL INSIGHTS SCRATCHPAD\n\n"
            + fixture["en"]["label"]
            + "\n\n"
            + fixture["en"]["content"]
            + "\n"
        )
        manifest.update(
            {
                "example_summary_generation": generation,
                "summary_provenance": "Handwritten illustrative mock summary; not generated research findings",
                "summary_fixture_sha256": hashlib.sha256(
                    FIXTURE.read_bytes()
                ).hexdigest(),
                "anchors": {
                    "island_root": roots[0]["id"],
                    "crossover": crosses[0]["id"],
                },
            }
        )
    (directory / "dataset.json").write_text(json.dumps(manifest, indent=2) + "\n")
    config_path = directory / "experiment_config.yaml"
    if config_path.is_file():
        config = yaml.safe_load(config_path.read_text())
        config["database_config"]["db_path"] = "programs.sqlite"
        config["evolution_config"]["results_dir"] = "."
        config["evolution_config"]["init_program_path"] = "initial.py"
        config["evolution_config"]["callback_url"] = None
        config["results_directory"] = "."
        if "job_config" in config:
            config["job_config"]["eval_program_path"] = "evaluate.py"
        config_path.write_text(
            yaml.safe_dump(config, allow_unicode=True, sort_keys=False)
        )
    return {
        **manifest,
        "integrity_check": "ok",
        "database_sha256": inventory(directory)["programs.sqlite"],
        "reasoning_before": reasoning_report["before"],
        "reasoning_after": reasoning_report["after"],
    }


def build(
    guide_source: Path, output: Path, demo_source: Path | None = None
) -> dict[str, Any]:
    """Publish both validated mock datasets in a new destination directory."""
    guide_source, output = guide_source.resolve(), output.resolve()
    if output.exists():
        raise FileExistsError(output)
    if output.is_relative_to(guide_source) or (
        demo_source and output.is_relative_to(demo_source.resolve())
    ):
        raise ValueError("Destination must be outside source runs")
    before = inventory(guide_source)
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".mock-datasets-", dir=output.parent))
    try:
        guide = staging / "mock-guide"
        demo = staging / "mock-demo"
        copy_run(guide_source, guide)
        if demo_source:
            copy_run(demo_source.resolve(), demo)
        else:
            subprocess.run(
                [
                    sys.executable,
                    str(REPO / "ShinkaEvolve/examples/interactive_sandbox/run_evo.py"),
                    "--init-only",
                    "--results-dir",
                    str(demo),
                ],
                check=True,
                env={**os.environ, "SHINKA_PRICING_MODE": "offline"},
            )
        evidence = {
            "mock-guide": prepare_run(guide, "mock-guide", guide_source),
            "mock-demo": prepare_run(
                demo, "mock-demo", demo_source.resolve() if demo_source else demo
            ),
            "guide_source_sha256": before["programs.sqlite"],
            "guide_source_unchanged": inventory(guide_source) == before,
        }
        if not evidence["guide_source_unchanged"]:
            raise ValueError("Guide source changed during preparation")
        (staging / "preparation.json").write_text(json.dumps(evidence, indent=2) + "\n")
        staging.rename(output)
        return evidence
    except BaseException:
        shutil.rmtree(staging)
        raise


def main() -> None:
    """Parse explicit source and destination paths for release preparation."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--guide-source", type=Path, required=True)
    parser.add_argument("--demo-source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.guide_source, args.output, args.demo_source), indent=2))


if __name__ == "__main__":
    main()
