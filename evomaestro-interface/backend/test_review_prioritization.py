"""Integration coverage for Expert Review Prioritization settings."""

from __future__ import annotations

import asyncio
import importlib
import json
import sqlite3
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from pytest import MonkeyPatch, mark
from shinka.interactive.interactive_db import InteractiveDatabase


def test_program_browsing_normalizes_reasoning_without_changing_delete_mode_database(
    tmp_path: Path,
    monkeypatch: MonkeyPatch,
) -> None:
    """The read-only endpoint supports release snapshots and masks stale vectors."""
    import hashlib

    from shinka.database import DatabaseConfig, Program, ProgramDatabase

    main = _load_backend()
    db_path = tmp_path / "release.sqlite"
    db = ProgramDatabase(
        DatabaseConfig(db_path=str(db_path), num_islands=1), embedding_model=""
    )
    db.add(
        Program(id="seed", code="print(1)", complexity=1, correct=True),
        defer_maintenance=True,
    )
    db.conn.execute(
        "UPDATE programs SET metadata = ?, reasoning_embedding = '[1,2]', reasoning_embedding_pca_2d = '[9,9]', reasoning_embedding_cluster_id = 3",
        (json.dumps({"patch_description": "Initial program setup"}),),
    )
    db.conn.commit()
    db.close()
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA journal_mode=DELETE")
    before = hashlib.sha256(db_path.read_bytes()).hexdigest()
    monkeypatch.setattr(main, "SEARCH_ROOT", str(tmp_path))
    main.db_cache.pop(db_path.name, None)
    rows = asyncio.run(main.get_programs(db_path.name, timestamp_check=False))
    assert len(rows) == 1
    assert rows[0]["reasoning_embedding"] == []
    assert rows[0]["reasoning_embedding_pca_2d"] == []
    assert rows[0]["reasoning_embedding_cluster_id"] is None
    assert hashlib.sha256(db_path.read_bytes()).hexdigest() == before


@mark.parametrize("with_control_tables", [False, True])
def test_browsing_and_polling_preserve_release_snapshot(
    tmp_path: Path, monkeypatch: MonkeyPatch, with_control_tables: bool
) -> None:
    """HTTP reads and WebSocket polling cannot create tables or switch journals."""
    import hashlib

    main = _load_backend()
    db_path = tmp_path / "snapshot.sqlite"
    _create_database(db_path)
    if with_control_tables:
        InteractiveDatabase(str(db_path))
    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA journal_mode=DELETE")
    before = hashlib.sha256(db_path.read_bytes()).hexdigest()
    monkeypatch.setattr(main, "SEARCH_ROOT", str(tmp_path))
    assert asyncio.run(main.get_run_status(db_path.name))["run_state"] == "unknown"
    assert asyncio.run(main.get_banned(db_path.name)) == {"banned_ids": []}
    assert asyncio.run(main.get_commands(db_path.name)) == []
    assert (
        asyncio.run(main.get_review_prioritization_status(db_path.name))[
            "prioritized_programs"
        ]
        == []
    )
    asyncio.run(main.get_review_prioritization_settings(db_path.name))
    result = main._ws_poll_db(str(db_path), "", 0)
    assert result["count"] == 2 and result["status"] is None
    readonly = InteractiveDatabase(str(db_path), read_only=True)
    assert readonly.get_command(1) is None
    assert hashlib.sha256(db_path.read_bytes()).hexdigest() == before


def _create_database(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            """
            CREATE TABLE programs (
                id TEXT PRIMARY KEY,
                parent_id TEXT,
                combined_score REAL,
                generation INTEGER,
                timestamp REAL,
                review_priority_level TEXT DEFAULT 'none',
                review_priority_data TEXT
            )
            """
        )
        conn.executemany(
            """
            INSERT INTO programs
            (id, parent_id, combined_score, generation, timestamp)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                ("parent", None, 1.0, 0, 1.0),
                ("child", "parent", 1.4, 1, 2.0),
            ],
        )
        conn.execute(
            """
            CREATE TABLE review_priority_metrics (
                program_id TEXT PRIMARY KEY,
                score_change REAL,
                dissimilarity_code REAL,
                dissimilarity_reasoning REAL
            )
            """
        )
        conn.execute(
            """
            INSERT INTO review_priority_metrics
            (program_id, score_change, dissimilarity_code, dissimilarity_reasoning)
            VALUES ('child', 0.4, 0.2, 0.6)
            """
        )
        conn.commit()
    finally:
        conn.close()


def _load_backend():
    evolve_shell_root = str(Path(__file__).resolve().parents[1])
    if evolve_shell_root not in sys.path:
        sys.path.insert(0, evolve_shell_root)
    return importlib.import_module("backend.main")


def test_settings_endpoint_and_runner_share_canonical_storage(
    tmp_path: Path,
    monkeypatch,
) -> None:
    main = _load_backend()
    db_path = tmp_path / "programs.sqlite"
    _create_database(db_path)
    monkeypatch.setattr(main, "SEARCH_ROOT", str(tmp_path))

    request = main.ReviewPrioritizationSettingsRequest(
        db_path=db_path.name,
        mode="dissimilarity",
        dissimilarity_embedding="reasoning",
        dissimilarity_moderate=0.3,
        dissimilarity_high=0.5,
    )
    main._last_review_priority_count.pop(db_path.name, None)
    response = asyncio.run(main.update_review_prioritization_settings(request))

    assert response == {
        "status": "ok",
        "updated": 1,
        "counts": {"none": 0, "moderate": 0, "high": 1},
    }
    assert main._last_review_priority_count[db_path.name] == 1

    interactive_db = InteractiveDatabase(str(db_path))
    saved = interactive_db.read_review_prioritization_settings()
    assert saved == {
        "mode": "dissimilarity",
        "score_change_moderate": 0.15,
        "score_change_high": 0.3,
        "dissimilarity_moderate": 0.3,
        "dissimilarity_high": 0.5,
        "dissimilarity_embedding": "reasoning",
    }

    conn = sqlite3.connect(db_path)
    try:
        tables = {
            str(row[0])
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        assert "review_prioritization_settings" not in tables

        row = conn.execute(
            """
            SELECT review_priority_level, review_priority_data
            FROM programs WHERE id = 'child'
            """
        ).fetchone()
        assert row[0] == "high"
        assert json.loads(row[1]) == {
            "mode": "dissimilarity",
            "embedding_source": "reasoning",
            "dissimilarity": 0.6,
            "reason": "Min reasoning dissimilarity 0.600 (>=0.5)",
        }
    finally:
        conn.close()

    loaded = asyncio.run(main.get_review_prioritization_settings(db_path.name))
    assert loaded == {**saved, "is_custom": False}

    status = asyncio.run(main.get_review_prioritization_status(db_path.name))
    assert status == {
        "prioritized_programs": [
            {
                "id": "child",
                "review_priority_level": "high",
                "review_priority_data": {
                    "mode": "dissimilarity",
                    "embedding_source": "reasoning",
                    "dissimilarity": 0.6,
                    "reason": "Min reasoning dissimilarity 0.600 (>=0.5)",
                },
                "combined_score": 1.4,
                "generation": 1,
                "timestamp": 2.0,
            }
        ],
        "error": None,
    }


def test_http_settings_validation_preserves_saved_priorities(
    tmp_path: Path,
    monkeypatch: MonkeyPatch,
) -> None:
    """Exercise HTTP parsing and persistence across FastAPI/Starlette upgrades."""
    main = _load_backend()
    db_path = tmp_path / "http-programs.sqlite"
    _create_database(db_path)
    monkeypatch.setattr(main, "SEARCH_ROOT", str(tmp_path))
    endpoint = "/api/run/review_prioritization_settings"
    payload = {
        "db_path": db_path.name,
        "mode": "dissimilarity",
        "dissimilarity_embedding": "reasoning",
        "dissimilarity_moderate": 0.3,
        "dissimilarity_high": 0.5,
    }

    with TestClient(main.app) as client:
        response = client.post(endpoint, json=payload)
        assert response.status_code == 200
        assert response.json()["counts"] == {"none": 0, "moderate": 0, "high": 1}

        saved = client.get(endpoint, params={"db_path": db_path.name})
        assert saved.status_code == 200
        assert saved.json()["dissimilarity_embedding"] == "reasoning"

        invalid_mode = client.post(endpoint, json={**payload, "mode": "unknown"})
        assert invalid_mode.status_code == 400
        invalid_threshold = client.post(
            endpoint, json={**payload, "dissimilarity_high": "invalid"}
        )
        assert invalid_threshold.status_code == 422
        assert client.get(endpoint, params={"db_path": db_path.name}).json() == (
            saved.json()
        )

        status = client.get(
            "/api/review_prioritization/status", params={"db_path": db_path.name}
        )
        assert status.status_code == 200
        priorities = status.json()["prioritized_programs"]
        assert [(p["id"], p["review_priority_level"]) for p in priorities] == [
            ("child", "high")
        ]
