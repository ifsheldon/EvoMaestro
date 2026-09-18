"""Guide discovery, immutable snapshots, and offline preparation contracts."""

from __future__ import annotations

import importlib
import json
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.datasets import GUIDE_ID, Dataset, DatasetRole
from tools.prepare_mock_datasets import build, inventory, snapshot


def test_guide_discovery_and_mutations_preserve_database(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An external guide is available only through guide discovery and stays immutable."""
    main = importlib.import_module("backend.main")
    search = tmp_path / "runs"
    search.mkdir()
    demo = search / "mock-demo/programs.sqlite"
    demo.parent.mkdir()
    demo.touch()
    guide = tmp_path / "mock-guide" / "programs.sqlite"
    guide.parent.mkdir()
    with sqlite3.connect(guide) as conn:
        conn.execute("CREATE TABLE programs (id TEXT)")
    before = guide.read_bytes()
    monkeypatch.setattr(main, "SEARCH_ROOT", str(search))
    monkeypatch.setattr(main, "GUIDE_DB_PATH", guide)
    with TestClient(main.app) as client:
        info = client.get("/guide_dataset").json()
        assert info["path"] == GUIDE_ID and info["read_only"]
        assert [item["path"] for item in client.get("/list_databases").json()] == [
            "runs/mock-demo/programs.sqlite"
        ]
        for identity in (GUIDE_ID, str(guide)):
            assert (
                client.post(
                    "/api/callback",
                    json={"event": "program.queued", "db_path": identity},
                ).json()["status"]
                == "ignored"
            )
            for endpoint in (
                "pause",
                "resume",
                "start",
                "step",
                "stop",
                "suggest",
                "merge",
                "set_target",
                "review_prioritization_settings",
            ):
                response = client.post(
                    f"/api/run/{endpoint}", json={"db_path": identity}
                )
                assert response.status_code == 403, (identity, endpoint, response.text)
    assert guide.read_bytes() == before


def test_manifest_protects_imported_guide_and_rejects_escape(tmp_path: Path) -> None:
    """Capabilities follow the canonical dataset even through scan aliases."""
    guide = tmp_path / "copied-guide" / "programs.sqlite"
    guide.parent.mkdir()
    guide.touch()
    (guide.parent / "dataset.json").write_text(json.dumps({"role": "mock-guide"}))
    resolved = Dataset.resolve(
        "copied-guide/programs.sqlite", tmp_path, tmp_path / "uninstalled.sqlite"
    )
    assert resolved.role == DatasetRole.MOCK_GUIDE
    with pytest.raises(HTTPException, match="read-only"):
        resolved.require_writable()
    with pytest.raises(HTTPException):
        Dataset.resolve("../outside.sqlite", tmp_path, guide)


def test_guide_inside_search_root_has_one_identity_and_missing_guide_is_explicit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A packaged guide stays out of selectors and fails clearly if absent."""
    main = importlib.import_module("backend.main")
    guide = tmp_path / "mock-guide/programs.sqlite"
    guide.parent.mkdir()
    guide.touch()
    monkeypatch.setattr(main, "SEARCH_ROOT", str(tmp_path))
    monkeypatch.setattr(main, "GUIDE_DB_PATH", guide)
    with TestClient(main.app) as client:
        identity = client.get("/guide_dataset").json()["path"]
        assert identity == f"{tmp_path.name}/mock-guide/programs.sqlite"
        assert client.get("/list_databases").json() == []
        assert client.get("/dataset", params={"db_path": identity}).json()["read_only"]
        guide.unlink()
        assert client.get("/guide_dataset").status_code == 404
        assert client.get("/list_databases").json() == []


def test_snapshot_includes_committed_wal_and_protects_destination(
    tmp_path: Path,
) -> None:
    """A backup sees committed WAL rows without checkpointing the source."""
    source = tmp_path / "source.sqlite"
    conn = sqlite3.connect(source)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA wal_autocheckpoint=0")
    conn.execute("CREATE TABLE programs (id TEXT)")
    conn.commit()
    conn.execute("INSERT INTO programs VALUES ('committed-in-wal')")
    conn.commit()
    before = inventory(tmp_path)
    destination = tmp_path / "snapshot.sqlite"
    try:
        snapshot(source, destination)
        with sqlite3.connect(destination) as result:
            assert (
                result.execute("SELECT id FROM programs").fetchone()[0]
                == "committed-in-wal"
            )
        after = inventory(tmp_path)
        assert all(after[name] == value for name, value in before.items())
        with pytest.raises(FileExistsError):
            snapshot(source, destination)
    finally:
        conn.close()


def test_failed_preparation_publishes_nothing(tmp_path: Path) -> None:
    """Invalid guide data fails without leaving a partial output or changing sources."""
    source = tmp_path / "source"
    source.mkdir()
    with sqlite3.connect(source / "programs.sqlite") as conn:
        conn.execute(
            "CREATE TABLE programs (id TEXT, generation INTEGER, timestamp REAL, metadata TEXT)"
        )
    before = inventory(source)
    output = tmp_path / "output"
    with pytest.raises(ValueError, match="empty"):
        build(source, output, source)
    assert not output.exists()
    assert not list(tmp_path.glob(".mock-datasets-*"))
    assert inventory(source) == before


def test_seed_only_run_resumes_without_duplicate_initial_nodes(tmp_path: Path) -> None:
    """The real sandbox initializer and resumed runner preserve five seed IDs offline."""
    import os

    from shinka.interactive.interactive_db import InteractiveDatabase

    repo = Path(__file__).resolve().parents[2]
    script = repo / "ShinkaEvolve/examples/interactive_sandbox/run_evo.py"
    destination = tmp_path / "mock-demo"
    wrapper = """
import runpy, socket, sys
def blocked(*args, **kwargs):
    raise AssertionError('External connections are forbidden in sandbox tests')
socket.socket.connect = blocked
socket.create_connection = blocked
script = sys.argv.pop(1)
sys.path.insert(0, str(__import__('pathlib').Path(script).parent))
sys.argv[0] = script
runpy.run_path(script, run_name='__main__')
"""
    command = [
        sys.executable,
        "-c",
        wrapper,
        str(script),
        "--results-dir",
        str(destination),
    ]
    environment = {**os.environ, "SHINKA_PRICING_MODE": "offline"}
    with (tmp_path / "runner.log").open("w") as log:
        subprocess.run(
            [*command, "--init-only"],
            env=environment,
            stdout=log,
            stderr=log,
            check=True,
            timeout=40,
        )
        database = destination / "programs.sqlite"
        with sqlite3.connect(database) as conn:
            original = conn.execute(
                "SELECT id, generation FROM programs ORDER BY id"
            ).fetchall()
        assert len(original) == 5 and all(generation == 0 for _, generation in original)
        started = time.time()
        process = subprocess.Popen(
            [*command, "--resume"], env=environment, stdout=log, stderr=log
        )
        try:
            control = InteractiveDatabase(str(database), read_only=True)
            for _ in range(100):
                assert process.poll() is None, (
                    "Resumed mock runner exited before becoming ready"
                )
                if (control.read_heartbeat() or 0) >= started:
                    break
                time.sleep(0.1)
            else:
                pytest.fail("Resumed mock runner did not publish a heartbeat")
            with sqlite3.connect(database) as conn:
                assert (
                    conn.execute(
                        "SELECT id, generation FROM programs ORDER BY id"
                    ).fetchall()
                    == original
                )
        finally:
            process.terminate()
            process.wait(timeout=10)
