"""HTTP run controls must reach the same controller used by the runner."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from pytest import MonkeyPatch
from shinka.interactive.interactive_db import CommandStatus, CommandType
from shinka.interactive.web_controller import WebController

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_run_controls_reach_controller_without_obsolete_continue(
    tmp_path: Path, monkeypatch: MonkeyPatch
) -> None:
    """Resume and one-shot step still work; the retired endpoint queues nothing."""
    main = importlib.import_module("backend.main")
    db_path = tmp_path / "programs.sqlite"
    controller = WebController(str(db_path))
    monkeypatch.setattr(main, "SEARCH_ROOT", str(tmp_path))
    monkeypatch.setattr(main, "GUIDE_DB_PATH", tmp_path / "absent-guide.sqlite")

    with TestClient(main.app) as client:
        assert (
            client.post("/api/run/continue", json={"db_path": db_path.name}).status_code
            == 404
        )
        assert controller.interactive_db.get_recent_commands() == []

        for command in (
            CommandType.PAUSE,
            CommandType.RESUME,
            CommandType.STEP,
            CommandType.START,
            CommandType.STOP,
        ):
            response = client.post(
                f"/api/run/{command.value}", json={"db_path": db_path.name}
            )
            assert response.status_code == 200
            assert controller.process_commands() == []
            stored = controller.interactive_db.get_command(
                response.json()["command_id"]
            )
            assert stored is not None
            assert stored.command_type == command
            assert stored.status == CommandStatus.COMPLETED

            if command == CommandType.PAUSE:
                assert controller.is_paused
            elif command == CommandType.RESUME:
                assert not controller.is_paused
            elif command == CommandType.STEP:
                assert controller.step_requested
                assert not controller.step_requested
            elif command == CommandType.START:
                assert controller.start_requested
            else:
                assert controller.stop_requested
