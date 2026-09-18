"""Anonymous demo capabilities are enforced before database and runner access."""

from __future__ import annotations

import importlib
import json
import secrets
import socket
import sqlite3
import sys
from collections.abc import Iterator
from pathlib import Path
from types import ModuleType
from typing import Any, Never

import pytest
from fastapi.testclient import TestClient
from shinka.interactive.interactive_db import InteractiveDatabase
from starlette.websockets import WebSocketDisconnect

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.datasets import GUIDE_ID
from backend.public_demo import PublicDemoPolicy

type DemoFixture = tuple[ModuleType, TestClient, Path, Path, str]


@pytest.fixture
def public_demo(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Iterator[DemoFixture]:
    """Serve copies of both packaged mocks while forbidding network connections."""

    def blocked(*_args: Any, **_kwargs: Any) -> Never:
        raise AssertionError("External connections are forbidden in demo policy tests")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
    main = importlib.import_module("backend.main")
    repo = Path(__file__).resolve().parents[2]
    root = tmp_path / "runs"
    demo = root / "mock-demo/programs.sqlite"
    guide = tmp_path / "mock-guide/programs.sqlite"
    for path, name in ((demo, "mock-demo"), (guide, "mock-guide")):
        path.parent.mkdir(parents=True)
        with (
            sqlite3.connect(
                f"{(repo / 'datasets' / name / 'programs.sqlite').as_uri()}?mode=ro",
                uri=True,
            ) as source,
            sqlite3.connect(path) as target,
        ):
            source.backup(target)
        (path.parent / "dataset.json").write_text(json.dumps({"role": name}))
    token = secrets.token_urlsafe(32)
    monkeypatch.setattr(main, "SEARCH_ROOT", str(root))
    monkeypatch.setattr(main, "GUIDE_DB_PATH", guide)
    monkeypatch.setattr(main, "PUBLIC_DEMO", None)
    main.configure_public_demo(demo, token)
    main.db_cache.clear()
    with TestClient(main.app) as client:
        yield main, client, demo, guide, token
    main.db_cache.clear()


def test_startup_rejects_non_mock_configuration(public_demo: DemoFixture) -> None:
    """A permissive search root or renamed ordinary database cannot enable hosting."""
    main, _, demo, guide, token = public_demo
    (demo.parent / "dataset.json").write_text('{"role":"run"}')
    with pytest.raises(ValueError, match="mock-demo"):
        PublicDemoPolicy.create(demo, Path(main.SEARCH_ROOT), guide, token)
    (demo.parent / "dataset.json").write_text('{"role":"mock-demo"}')
    (guide.parent / "dataset.json").write_text('{"role":"run"}')
    with pytest.raises(ValueError, match="mock-guide"):
        PublicDemoPolicy.create(demo, Path(main.SEARCH_ROOT), guide, token)
    with pytest.raises(ValueError, match="credential"):
        PublicDemoPolicy.create(demo, Path(main.SEARCH_ROOT), guide, "")


def test_http_allowlist_rejects_files_other_runs_and_aliases(
    public_demo: DemoFixture,
) -> None:
    """Every dataset read rejects unrelated files before opening them."""
    main, client, demo, guide, _ = public_demo
    root = Path(main.SEARCH_ROOT)
    unrelated = root / "private.sqlite"
    unrelated.write_text("must never be opened as a database")
    source = demo.parent / "private.py"
    source.write_text("private source")
    alias = root / "escape.sqlite"
    alias.symlink_to(unrelated)
    identities = (
        "private.sqlite",
        str(unrelated),
        str(alias),
        str(source),
        "../private.sqlite",
        "runs/../private.sqlite",
        str(root.parent / "outside.sqlite"),
    )
    endpoints = (
        "/dataset",
        "/get_programs",
        "/get_meta_files",
        "/get_meta_content",
        "/download_meta_pdf",
        "/experiment_config",
        "/api/run/status",
        "/api/run/banned",
        "/api/run/commands",
        "/api/run/review_prioritization_settings",
        "/api/review_prioritization/status",
    )
    for identity in identities:
        for endpoint in endpoints:
            response = client.get(
                endpoint, params={"db_path": identity, "generation": 1}
            )
            assert response.status_code == 403, (identity, endpoint, response.text)
        assert (
            client.post("/api/run/pause", json={"db_path": identity}).status_code == 403
        )
    listing = client.get("/list_databases").json()
    assert [item["path"] for item in listing] == [main.PUBLIC_DEMO.demo_identity]
    for identity in (str(demo), main.PUBLIC_DEMO.demo_identity, GUIDE_ID, str(guide)):
        response = client.get("/dataset", params={"db_path": identity})
        assert response.status_code == 200
        assert response.json()["maestro_chat_enabled"] is False
        assert (
            client.get("/maestro_context", params={"db_path": identity}).status_code
            == 403
        )


def test_websocket_authorization_precedes_accept_and_callbacks_require_secret(
    public_demo: DemoFixture,
) -> None:
    """Anonymous visitors cannot subscribe to other runs or impersonate the runner."""
    main, client, demo, guide, token = public_demo
    with (
        pytest.raises(WebSocketDisconnect) as exc,
        client.websocket_connect("/ws/private.sqlite"),
    ):
        pytest.fail("An unauthorized WebSocket was accepted")
    assert exc.value.code == 1008
    event = {"event": "program.queued", "db_path": str(demo), "program_id": "queued"}
    for headers in ({}, {"Authorization": "Bearer invalid"}):
        assert (
            client.post("/api/callback", json=event, headers=headers).status_code == 401
        )
    headers = {"Authorization": f"Bearer {token}"}
    for identity in (str(guide), "private.sqlite"):
        assert (
            client.post(
                "/api/callback", json={**event, "db_path": identity}, headers=headers
            ).status_code
            == 403
        )
    with client.websocket_connect(f"/ws/{main.PUBLIC_DEMO.demo_identity}") as websocket:
        response = client.post("/api/callback", json=event, headers=headers)
        assert response.status_code == 200
        assert websocket.receive_json()["program_id"] == "queued"
    with client.websocket_connect(f"/ws/{GUIDE_ID}"):
        pass
    assert token not in repr(main.PUBLIC_DEMO)


def test_interactive_controls_remain_available_but_guide_is_fixed(
    public_demo: DemoFixture,
) -> None:
    """Public mode keeps mock steering and existing generation limits intact."""
    _, client, demo, guide, _ = public_demo
    control = InteractiveDatabase(str(demo))
    control.write_heartbeat()
    before_guide = guide.read_bytes()
    requests = {
        "start": {},
        "pause": {},
        "resume": {},
        "step": {},
        "stop": {},
        "set_target": {"target_generations": 20},
        "suggest": {"parent_id": "seed-1", "prompt": "Try a mutation"},
        "merge": {"parent_ids": ["seed-1", "seed-2"]},
        "ban": {"program_ids": ["seed-1"]},
        "unban": {"program_ids": ["seed-1"]},
    }
    for endpoint, payload in requests.items():
        assert (
            client.post(
                f"/api/run/{endpoint}", json={"db_path": str(demo), **payload}
            ).status_code
            == 200
        )
        assert (
            client.post(
                f"/api/run/{endpoint}", json={"db_path": GUIDE_ID, **payload}
            ).status_code
            == 403
        )
    count = len(control.get_recent_commands(limit=100))
    for target in (-1, 0, 100_001):
        response = client.post(
            "/api/run/set_target",
            json={"db_path": str(demo), "target_generations": target},
        )
        assert response.status_code == 422
    assert len(control.get_recent_commands(limit=100)) == count
    assert guide.read_bytes() == before_guide


@pytest.mark.parametrize(
    ("relative", "endpoint"),
    (
        ("meta_1.txt", "/get_meta_content"),
        ("meta_1.txt", "/get_meta_files"),
        ("meta_1.txt", "/download_meta_pdf"),
        ("experiment_config.yaml", "/experiment_config"),
        ("experiment_config.yaml", "/api/run/review_prioritization_settings"),
        ("review_prioritization_error.json", "/api/review_prioritization/status"),
    ),
)
def test_sidecars_cannot_escape_through_symlinks(
    public_demo: DemoFixture, relative: str, endpoint: str
) -> None:
    """Permitted database identities do not grant access to arbitrary sidecar targets."""
    _, client, demo, _, _ = public_demo
    outside = demo.parent.parent / "private.txt"
    outside.write_text("private material")
    (demo.parent / relative).symlink_to(outside)
    response = client.get(endpoint, params={"db_path": str(demo), "generation": 1})
    assert response.status_code == 403


def test_summary_export_is_local_text_and_config_exposes_no_host_path(
    public_demo: DemoFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Public summary downloads never invoke a renderer or follow a generation path."""
    main, client, demo, _, _ = public_demo

    def forbidden(*_args: Any, **_kwargs: Any) -> Never:
        raise AssertionError("Public requests must not invoke an HTML/PDF renderer")

    monkeypatch.setattr(main, "_generate_pdf", forbidden)
    (demo.parent / "meta").mkdir()
    (demo.parent / "meta/meta_1.txt").write_text("An illustrative summary")
    response = client.get(
        "/download_meta_pdf", params={"db_path": str(demo), "generation": 1}
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert response.headers["content-disposition"].endswith('"meta_1.txt"')
    assert "An illustrative summary" in response.text
    for endpoint in ("/get_meta_content", "/download_meta_pdf"):
        for generation in ("../../private", "-1"):
            assert (
                client.get(
                    endpoint, params={"db_path": str(demo), "generation": generation}
                ).status_code
                == 422
            )
    (demo.parent / "experiment_config.yaml").write_text(
        "evolution_config:\n  task_sys_msg: Mock task\n  api_key: not-for-clients\n"
    )
    response = client.get("/experiment_config", params={"db_path": str(demo)})
    assert response.json()["results_dir"] == ""
    assert "not-for-clients" not in response.text
    assert str(demo.parent) not in response.text
