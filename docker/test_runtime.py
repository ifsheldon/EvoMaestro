"""Regression checks for durable demo initialization and public viewer confinement."""

from __future__ import annotations

import functools
import hashlib
import http.client
import json
import shutil
import sqlite3
import threading
from collections.abc import Iterator
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest
import runtime
from runtime import REPO, prepare_demo
from viewer import PublicViewerHandler, ViewerFiles


def test_start_creates_private_credential_before_supervisor(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Startup generates a private token and never overwrites an existing one."""
    token = tmp_path / "callback-token"
    monkeypatch.setattr(runtime, "DATA", tmp_path)
    monkeypatch.setattr(runtime, "TOKEN", token)
    commands: list[str] = []

    def capture_exec(executable: str, _arguments: list[str]) -> None:
        """Record the launched executable without starting background services."""
        commands.append(executable)

    monkeypatch.setattr(runtime.os, "execv", capture_exec)
    runtime.start()
    assert token.stat().st_mode & 0o777 == 0o600
    assert token.stat().st_size >= 32
    assert commands == ["/usr/bin/supervisord"]
    with pytest.raises(FileExistsError):
        runtime.start()


def test_restart_preserves_progress_and_packaged_seed(tmp_path: Path) -> None:
    """Initialization copies once and never replaces a resumed user's state."""
    source = REPO / "datasets/mock-demo"
    original = hashlib.sha256((source / "programs.sqlite").read_bytes()).digest()
    database = prepare_demo(source, tmp_path)
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE programs SET generation = 7")
    assert prepare_demo(source, tmp_path) == database
    with sqlite3.connect(database) as connection:
        assert connection.execute(
            "SELECT DISTINCT generation FROM programs"
        ).fetchall() == [(7,)]
    assert (
        hashlib.sha256((source / "programs.sqlite").read_bytes()).digest() == original
    )


def test_failed_initialization_publishes_no_partial_run(tmp_path: Path) -> None:
    """A rejected source leaves no destination that a later restart might reuse."""
    source = tmp_path / "source"
    source.mkdir()
    shutil.copyfile(
        REPO / "datasets/mock-demo/programs.sqlite", source / "programs.sqlite"
    )
    (source / "unsafe").symlink_to(source / "programs.sqlite")
    data = tmp_path / "data"
    data.mkdir()
    with pytest.raises(ValueError, match="symlink"):
        prepare_demo(source, data)
    assert list(data.iterdir()) == []


def test_invalid_existing_run_is_not_overwritten(tmp_path: Path) -> None:
    """A broken persisted database fails explicitly instead of resetting the demo."""
    database = prepare_demo(REPO / "datasets/mock-demo", tmp_path)
    database.write_bytes(b"broken database")
    with pytest.raises(sqlite3.DatabaseError):
        prepare_demo(REPO / "datasets/mock-demo", tmp_path)
    assert database.read_bytes() == b"broken database"


@pytest.fixture
def viewer(tmp_path: Path) -> Iterator[tuple[int, Path]]:
    """Serve a disposable recorded run through the public request boundary."""
    root = tmp_path / "runs"
    run = root / "run_20260319_183058"
    run.mkdir(parents=True)
    shutil.copyfile(
        REPO / "datasets/GraphMOP/results_50g_runs/run_20260319_183058/programs.sqlite",
        run / "programs.sqlite",
    )
    (run / "meta_1.txt").write_text("Example evolution summary")
    plots = run / "gen_1/results/plots"
    plots.mkdir(parents=True)
    (plots / "example.png").write_bytes(b"plot fixture")
    handler = functools.partial(
        PublicViewerHandler, files=ViewerFiles.from_directory(root)
    )
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server.server_port, run
        finally:
            server.shutdown()
            thread.join()


def request(port: int, target: str, method: str = "GET") -> tuple[int, bytes]:
    """Send a raw HTTP target without client-side traversal normalization."""
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
    try:
        connection.request(method, target)
        response = connection.getresponse()
        return response.status, response.read()
    finally:
        connection.close()


def test_viewer_browses_programs_and_artifacts_without_mutating_snapshot(
    viewer: tuple[int, Path],
) -> None:
    """The restricted server retains the upstream browsing workflow."""
    port, run = viewer
    original = hashlib.sha256((run / "programs.sqlite").read_bytes()).digest()
    status, body = request(port, "/list_databases")
    assert status == 200
    identity = json.loads(body)[0]["path"]
    status, body = request(port, f"/get_programs?db_path={identity}")
    assert status == 200 and len(json.loads(body)) == 56
    status, body = request(
        port, f"/get_meta_content?db_path={identity}&processed_count=1"
    )
    assert status == 200 and json.loads(body)["content"] == "Example evolution summary"
    status, body = request(
        port, "/plot_file/run_20260319_183058/gen_1/results/plots/example.png"
    )
    assert (status, body) == (200, b"plot fixture")
    assert request(port, "/")[0] == 200
    assert hashlib.sha256((run / "programs.sqlite").read_bytes()).digest() == original


@pytest.mark.parametrize(
    "target",
    [
        "/get_programs?db_path=/etc/passwd",
        "/get_programs?db_path=../runs-secret/programs.sqlite",
        "/get_programs?db_path=%2e%2e%2fruns-secret%2fprograms.sqlite",
        "/get_programs?db_path=run_20260319_183058/programs.sqlite&db_path=/etc/passwd",
        "/get_meta_content?db_path=run_20260319_183058/programs.sqlite&generation=1/../../etc/passwd",
        "/plot_file/../runs-secret/secret.png",
        "/plot_file/run_20260319_183058/programs.sqlite",
        "/visualization.py",
        "/%2e%2e/runtime.py",
    ],
)
def test_viewer_rejects_path_escape(viewer: tuple[int, Path], target: str) -> None:
    """Every public file-reading route rejects arbitrary files and ambiguous paths."""
    assert request(viewer[0], target)[0] == 403


def test_viewer_rejects_head_source_reads_and_symlinks(
    viewer: tuple[int, Path],
) -> None:
    """HEAD cannot bypass confinement, and even in-root symlink aliases are rejected."""
    port, run = viewer
    assert request(port, "/visualization.py", "HEAD")[0] == 403
    assert request(port, "/index.html", "HEAD")[0] == 200
    (run.parent / "alias").symlink_to(run, target_is_directory=True)
    assert request(port, "/get_programs?db_path=alias/programs.sqlite")[0] == 403
    with pytest.raises(ValueError, match="symlink"):
        ViewerFiles.from_directory(run.parent)


def test_viewer_preserves_recorded_failed_proposals(viewer: tuple[int, Path]) -> None:
    """Compatibility for older snapshots must not hide failures in newer runs."""
    port, run = viewer
    with sqlite3.connect(run / "programs.sqlite") as connection:
        connection.execute(
            "CREATE TABLE attempt_log (id INTEGER, generation INTEGER, "
            "details TEXT, created_at REAL, status TEXT)"
        )
        connection.execute(
            "INSERT INTO attempt_log VALUES (?, ?, ?, ?, ?)",
            (1, 51, json.dumps({"node_kind": "failed_proposal"}), 1.0, "failed"),
        )
    status, body = request(
        port, "/get_programs_summary?db_path=run_20260319_183058/programs.sqlite"
    )
    assert status == 200
    assert any(program["id"] == "failed:proposal:51" for program in json.loads(body))
