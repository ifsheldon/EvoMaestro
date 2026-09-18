"""Offline launcher regressions for runner arguments and production API routing."""

from __future__ import annotations

import asyncio
import importlib.util
import json
import shlex
import socket
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace
from typing import Any
from unittest.mock import Mock

import pytest


@pytest.fixture
def launcher(monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    """Load the launcher with no application import, network access, or child processes."""

    def blocked(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("Launcher tests must not make external calls")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", blocked)
    backend = ModuleType("backend")
    backend_main = ModuleType("backend.main")
    backend_main.app = object()
    backend.main = backend_main
    monkeypatch.setitem(sys.modules, "backend", backend)
    monkeypatch.setitem(sys.modules, "backend.main", backend_main)
    spec = importlib.util.spec_from_file_location(
        "evomaestro_launcher_test", Path(__file__).with_name("start.py")
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module.shutil, "which", lambda name: "/test/bin/bun")
    return module


def write_manifest(directory: Path, port: int) -> None:
    """Write the production rewrite shape emitted by this project's Next.js config."""
    directory.mkdir(exist_ok=True)
    (directory / "routes-manifest.json").write_text(
        json.dumps(
            {
                "rewrites": {
                    "beforeFiles": [],
                    "afterFiles": [],
                    "fallback": [
                        {
                            "source": "/api/:path*",
                            "destination": f"http://127.0.0.1:{port}/:path*",
                        }
                    ],
                }
            }
        )
    )


@pytest.mark.parametrize("auto_port", [False, True])
def test_stale_build_stops_before_starting_services(
    launcher: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    auto_port: bool,
) -> None:
    """Both explicit and automatically selected ports must match the saved rewrite."""
    monkeypatch.chdir(tmp_path)
    write_manifest(tmp_path / ".next", 8000)
    requested_port = 8000 if auto_port else 8001
    monkeypatch.setattr(
        launcher, "is_port_in_use", lambda port: auto_port and port == requested_port
    )
    monkeypatch.setattr(launcher, "find_available_port", lambda port: 8001)
    server = Mock(side_effect=AssertionError("Services must not start"))
    monkeypatch.setattr(launcher, "AsyncServer", server)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "start.py",
            "--shinka-search-root",
            str(tmp_path),
            "--release",
            "--skip-build",
            "--backend-port",
            str(requested_port),
            *(["--auto-port"] if auto_port else []),
        ],
    )
    with pytest.raises(SystemExit) as exc:
        asyncio.run(launcher.main())
    assert exc.value.code == 2
    assert "backend port 8001" in capsys.readouterr().err
    server.assert_not_called()


@pytest.mark.parametrize(
    "contents",
    [None, "not JSON", "[]", '{"rewrites": null}', '{"rewrites":{"fallback":[null]}}'],
)
def test_missing_or_invalid_build_requires_rebuild(
    launcher: ModuleType, tmp_path: Path, contents: str | None
) -> None:
    """Missing and malformed build data fail with a concrete recovery instruction."""
    if contents is not None:
        (tmp_path / "routes-manifest.json").write_text(contents)
    with pytest.raises(ValueError, match="without --skip-build"):
        launcher.validate_release_build(tmp_path, 8000)


@pytest.mark.parametrize("public_demo", [False, True])
@pytest.mark.parametrize("skip_build", [False, True])
def test_release_start_preserves_runner_arguments_and_private_credentials(
    launcher: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    public_demo: bool,
    skip_build: bool,
) -> None:
    """Release launches preserve argument boundaries and isolate callback credentials."""
    monkeypatch.chdir(tmp_path)
    write_manifest(tmp_path / ".next", 8001)
    monkeypatch.setattr(launcher, "is_port_in_use", lambda port: False)
    monkeypatch.setenv("EVOMAESTRO_CALLBACK_TOKEN", "inherited-test-credential")
    configure_public_demo = Mock()
    monkeypatch.setattr(
        launcher.backend_app,
        "configure_public_demo",
        configure_public_demo,
        raising=False,
    )
    if public_demo:
        runner = (
            Path(launcher.__file__).resolve().parents[1]
            / "ShinkaEvolve/examples/interactive_sandbox/run_evo.py"
        )
    else:
        runner = tmp_path / "task with spaces" / "run.py"
        runner.parent.mkdir()
        runner.touch()
    demo = tmp_path / "mock-demo/programs.sqlite"
    runner_arguments = [
        "--resume",
        "--results-dir",
        str(tmp_path / "run's data 中文"),
        "--label",
        "literal $(command); text",
        "--empty",
        "",
    ]
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "start.py",
            "--shinka-search-root",
            str(tmp_path),
            "--release",
            *(["--skip-build"] if skip_build else []),
            *(["--public-demo", "--db", str(demo)] if public_demo else []),
            "--backend-port",
            "8001",
            "--example-runner",
            str(runner),
            "--runner-args",
            shlex.join(runner_arguments),
        ],
    )
    child_calls: list[tuple[list[str], dict[str, Any]]] = []
    frontend_calls: list[tuple[list[str], dict[str, Any]]] = []
    build_calls: list[dict[str, Any]] = []
    backend_configs: list[Any] = []

    async def serve(stop_event: asyncio.Event) -> None:
        await stop_event.wait()

    def server_factory(config: Any) -> SimpleNamespace:
        backend_configs.append(config)
        return SimpleNamespace(serve=serve)

    async def run_child(command: list[str], name: str, **kwargs: Any) -> int:
        child_calls.append((command, kwargs))
        return 0

    async def run_frontend(command: list[str], name: str, **kwargs: Any) -> int:
        frontend_calls.append((command, kwargs))
        return 0

    async def build_process(*command: str, **kwargs: Any) -> SimpleNamespace:
        assert command == ("bun", "run", "build")
        build_calls.append(kwargs)

        async def wait() -> int:
            return 0

        return SimpleNamespace(wait=wait, returncode=0)

    monkeypatch.setattr(launcher, "AsyncServer", server_factory)
    monkeypatch.setattr(launcher, "run_child_process", run_child)
    monkeypatch.setattr(launcher, "run_frontend_process", run_frontend)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", build_process)

    async def run() -> None:
        monkeypatch.setattr(asyncio.get_running_loop(), "add_signal_handler", Mock())
        await launcher.main()

    asyncio.run(run())
    assert child_calls[0][0] == [
        sys.executable,
        str(runner),
        "--interactive",
        *runner_arguments,
    ]
    assert child_calls[0][1]["cwd"] == str(runner.parent)
    assert frontend_calls[0][0] == ["bun", "run", "start", "--", "-p", "3000"]
    assert frontend_calls[0][1]["env"]["API_PROXY"] == "http://127.0.0.1:8001"
    assert backend_configs[0].port == 8001
    assert len(build_calls) == (0 if skip_build else 1)
    for invocation in [frontend_calls[0][1], *build_calls]:
        assert "EVOMAESTRO_CALLBACK_TOKEN" not in invocation["env"]
        assert "EVOMAESTRO_DEMO_DB" not in invocation["env"]
    if public_demo:
        token = child_calls[0][1]["env"]["EVOMAESTRO_CALLBACK_TOKEN"]
        assert len(token) >= 32 and token != "inherited-test-credential"
        configure_public_demo.assert_called_once_with(demo.resolve(), token)
        assert frontend_calls[0][1]["env"]["EVOMAESTRO_PUBLIC_DEMO"] == "1"
    else:
        configure_public_demo.assert_not_called()
        assert "EVOMAESTRO_CALLBACK_TOKEN" not in child_calls[0][1]["env"]
        assert "EVOMAESTRO_PUBLIC_DEMO" not in frontend_calls[0][1]["env"]


def test_malformed_runner_quotes_fail_before_startup(
    launcher: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Unclosed quotes are a CLI error, never a partial service launch."""
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "start.py",
            "--shinka-search-root",
            str(tmp_path),
            "--runner-args",
            "--results-dir 'unfinished",
        ],
    )
    port_check = Mock(side_effect=AssertionError("Startup should not have begun"))
    monkeypatch.setattr(launcher, "is_port_in_use", port_check)
    with pytest.raises(SystemExit) as exc:
        asyncio.run(launcher.main())
    assert exc.value.code == 2
    assert "Invalid --runner-args" in capsys.readouterr().err
    port_check.assert_not_called()


@pytest.mark.parametrize(
    "arguments", [[], ["--db", "mock.sqlite", "--example-runner", "real_runner.py"]]
)
def test_public_demo_rejects_missing_identity_or_non_mock_runner(
    launcher: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    arguments: list[str],
) -> None:
    """An anonymous launch must select a dataset and cannot launch an arbitrary runner."""
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "start.py",
            "--shinka-search-root",
            str(tmp_path),
            "--public-demo",
            *arguments,
        ],
    )
    configure = Mock(side_effect=AssertionError("Invalid launches must fail first"))
    monkeypatch.setattr(
        launcher.backend_app, "configure_public_demo", configure, raising=False
    )
    with pytest.raises(SystemExit) as exc:
        asyncio.run(launcher.main())
    assert exc.value.code == 2
    configure.assert_not_called()
