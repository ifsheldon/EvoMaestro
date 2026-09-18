"""Maestro authorization follows canonical dataset capabilities, not client hints."""

from __future__ import annotations

import importlib
import json
import sqlite3
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def make_dataset(directory: Path, role: str | None = None) -> Path:
    """Create a real, minimal program database with optional role metadata."""
    directory.mkdir(parents=True)
    database = directory / "programs.sqlite"
    with sqlite3.connect(database) as connection:
        connection.execute("CREATE TABLE programs (id TEXT)")
    if role is not None:
        (directory / "dataset.json").write_text(json.dumps({"role": role}))
    return database


def test_demo_aliases_are_locked_without_disabling_evolution(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Renaming a demo or using an absolute/symlink alias cannot enable chat."""
    main = importlib.import_module("backend.main")
    root = tmp_path / "runs"
    demo = make_dataset(root / "renamed-demo", "mock-demo")
    guide = make_dataset(tmp_path / "guide", "mock-guide")
    alias = root / "ordinary-looking.sqlite"
    alias.symlink_to(demo)
    monkeypatch.setattr(main, "SEARCH_ROOT", str(root))
    monkeypatch.setattr(main, "GUIDE_DB_PATH", guide)
    before = {file: file.read_bytes() for file in demo.parent.iterdir()}
    with TestClient(main.app) as client:
        for identity in (
            "renamed-demo/programs.sqlite",
            "runs/renamed-demo/programs.sqlite",
            str(demo),
            str(alias),
        ):
            info = client.get("/dataset", params={"db_path": identity}).json()
            assert info["maestro_chat_enabled"] is False
            assert info["read_only"] is False
            main._dataset(identity).require_writable()
            response = client.get(
                "/maestro_context",
                params={"db_path": identity, "role": "run", "resultsDir": str(root)},
            )
            assert response.status_code == 403
        for identity in ("examples/mock-guide/programs.sqlite", str(guide)):
            assert (
                client.get("/maestro_context", params={"db_path": identity}).status_code
                == 403
            )
    assert {file: file.read_bytes() for file in demo.parent.iterdir()} == before


def test_real_runs_use_the_database_directory_and_reject_impostors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Only actual program databases inside the search root authorize Maestro."""
    main = importlib.import_module("backend.main")
    root = tmp_path / "runs"
    run = make_dataset(root / "experiment")
    (run.parent / "experiment_config.yaml").write_text(
        "evolution_config:\n  results_dir: /another/run\n"
    )
    source = run.parent / "source.py"
    source.write_text("pass\n")
    fake = root / "fake.sqlite"
    fake.write_text("not a database")
    unrelated = root / "unrelated.sqlite"
    with sqlite3.connect(unrelated) as connection:
        connection.execute("CREATE TABLE other (value TEXT)")
    outside = make_dataset(tmp_path / "outside")
    (root / "escape.sqlite").symlink_to(outside)
    monkeypatch.setattr(main, "SEARCH_ROOT", str(root))
    monkeypatch.setattr(main, "GUIDE_DB_PATH", tmp_path / "missing-guide.sqlite")
    with TestClient(main.app) as client:
        info = client.get("/dataset", params={"db_path": str(run)}).json()
        assert info["maestro_chat_enabled"] is True
        response = client.get("/maestro_context", params={"db_path": str(run)})
        assert response.status_code == 200
        assert response.json() == {"results_dir": str(run.parent)}
        for identity in (
            str(source),
            str(fake),
            str(unrelated),
            str(outside),
            "escape.sqlite",
            "../outside/programs.sqlite",
        ):
            assert (
                client.get("/maestro_context", params={"db_path": identity}).status_code
                == 400
            )
        assert (
            client.get(
                "/maestro_context", params={"db_path": "missing.sqlite"}
            ).status_code
            == 404
        )
        (run.parent / "dataset.json").write_text('{"role":"invalid"}')
        assert (
            client.get("/maestro_context", params={"db_path": str(run)}).status_code
            == 500
        )
