"""Initialize durable mock state and launch the container's supervised services."""

from __future__ import annotations

import argparse
import json
import os
import secrets
import sqlite3
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

from pydantic import SecretStr

REPO = Path(__file__).resolve().parents[1]
DATA = Path("/data")
TOKEN = Path("/run/evomaestro/callback-token")


def prepare_demo(source: Path, data: Path) -> Path:
    """Publish the initial copy atomically, preserving existing progress on restart."""
    destination = data / "mock-demo"
    if destination.is_symlink():
        raise ValueError("The mock working directory must not be a symlink")
    if not destination.exists():
        sys.path.insert(0, str(REPO / "evomaestro-interface/tools"))
        from prepare_mock_datasets import copy_run

        with tempfile.TemporaryDirectory(prefix=".initialize-", dir=data) as scratch:
            staged = Path(scratch) / "mock-demo"
            copy_run(source, staged)
            staged.rename(destination)
    database = destination / "programs.sqlite"
    manifest = destination / "dataset.json"
    if any(path.is_symlink() or not path.is_file() for path in (database, manifest)):
        raise ValueError(
            "The mock working copy requires regular database and manifest files"
        )
    if json.loads(manifest.read_text())["role"] != "mock-demo":
        raise ValueError("The working copy must have the mock-demo role")
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as connection:
        connection.execute("SELECT id FROM programs LIMIT 1")
        if connection.execute("PRAGMA quick_check").fetchone() != ("ok",):
            raise ValueError("The mock database failed its integrity check")
    return database


def callback_token() -> SecretStr:
    """Read the private, container-lifetime callback credential."""
    return SecretStr(TOKEN.read_text())


def start() -> None:
    """Prepare state and replace this process with Supervisor in the foreground."""
    prepare_demo(REPO / "datasets/mock-demo", DATA)
    # The run directory is a private tmpfs, separate from the durable data volume.
    descriptor = os.open(TOKEN, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write(secrets.token_urlsafe(32))
    os.execv(
        "/usr/bin/supervisord",
        ["supervisord", "-c", str(REPO / "docker/supervisord.conf")],
    )


def backend() -> None:
    """Serve the existing public-demo API on container loopback only."""
    sys.path.insert(0, str(REPO / "evomaestro-interface"))
    import uvicorn
    from backend import main

    main.SEARCH_ROOT = str(DATA)
    main.GUIDE_DB_PATH = REPO / "datasets/mock-guide/programs.sqlite"
    main.configure_public_demo(
        DATA / "mock-demo/programs.sqlite", callback_token().get_secret_value()
    )
    uvicorn.run(main.app, host="127.0.0.1", port=18001, timeout_graceful_shutdown=5)


def runner() -> None:
    """Resume the simulated runner with its private callback credential."""
    directory = REPO / "ShinkaEvolve/examples/interactive_sandbox"
    os.chdir(directory)
    environment = {**os.environ, "EVOLVE_SHELL_URL": "http://127.0.0.1:18001"}
    environment["EVOMAESTRO_CALLBACK_TOKEN"] = callback_token().get_secret_value()
    os.execve(
        sys.executable,
        [
            sys.executable,
            str(directory / "run_evo.py"),
            "--resume",
            "--results-dir",
            str(DATA / "mock-demo"),
        ],
        environment,
    )


def healthcheck() -> None:
    """Check all four public listeners, the private API, and runner heartbeat."""
    for port in (13000, 13001, 19870, 19871):
        with urlopen(f"http://127.0.0.1:{port}/", timeout=2) as response:
            if response.status != 200:
                raise RuntimeError(f"Listener {port} is unavailable")
    for port in (19870, 19871):
        with urlopen(f"http://127.0.0.1:{port}/list_databases", timeout=2) as response:
            databases = json.load(response)
        if not databases:
            raise RuntimeError(f"Viewer {port} has no datasets")
        for database in databases:
            query = urlencode({"db_path": database["path"]})
            with urlopen(
                f"http://127.0.0.1:{port}/get_program_count?{query}", timeout=2
            ) as response:
                if json.load(response)["count"] < 1:
                    raise RuntimeError(f"Viewer {port} has an empty dataset")
    with urlopen(
        "http://127.0.0.1:18001/api/run/status?db_path=mock-demo/programs.sqlite",
        timeout=2,
    ) as response:
        status = json.load(response)
    if time.time() - status["generation_backend_heartbeat_at"] > 60:
        raise RuntimeError("The mock runner heartbeat is stale")


def main() -> None:
    """Dispatch fixed container entry points without accepting arbitrary commands."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "service", choices=("start", "backend", "runner", "healthcheck")
    )
    args = parser.parse_args()
    {"start": start, "backend": backend, "runner": runner, "healthcheck": healthcheck}[
        args.service
    ]()


if __name__ == "__main__":
    main()
