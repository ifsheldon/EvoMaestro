"""
EvoMaestro Interface launcher -- starts the backend, frontend, and optionally an
evolution runner in a single process.

Usage examples:

  # Dev mode: start backend + frontend (hot-reload) pointing at a results directory
  uv run --locked --all-packages python start.py --shinka-search-root ./results

  # Production mode: build the frontend first, then serve it
  uv run --locked --all-packages python start.py --shinka-search-root ./results --release

  # Launch an evolution runner alongside the UI
  uv run --locked --all-packages python start.py \\
    --shinka-search-root ../../ShinkaEvolve/examples/interactive_sandbox \\
    --example-runner ShinkaEvolve/examples/interactive_sandbox/run_evo.py

  # Auto-pick ports if defaults (8000/3000) are occupied
  uv run --locked --all-packages python start.py --shinka-search-root ./results --auto-port

  # Specify ports and open the browser automatically
  uv run --locked --all-packages python start.py --shinka-search-root ./results \\
    --backend-port 9000 --frontend-port 4000 --open

  # Pre-select a specific database file
  uv run --locked --all-packages python start.py --shinka-search-root ./results --db ./results/exp.db --open

  # Launch the interactive mock example
  uv run --locked --all-packages python start.py  --shinka-search-root ../ShinkaEvolve/examples/interactive_sandbox/ --example-runner ../ShinkaEvolve/examples/interactive_sandbox/run_evo.py --auto-port --release
"""

import argparse
import asyncio
import json
import os
import secrets
import shlex
import shutil
import signal
import socket
import sys
import urllib.parse
import webbrowser
from pathlib import Path

from pydantic import SecretStr
from uvicorn.config import Config
from uvicorn.server import Server

# Import the backend module
# Ensure 'backend' is in python path if running from root
sys.path.append(os.getcwd())
try:
    import backend.main as backend_app
except ImportError:
    print(
        "Error: Could not import 'backend.main'. Make sure you are running from the project root."
    )
    sys.exit(1)


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    """
    Check if a port is already in use.

    Args:
        port: The port number to check.
        host: The host to check (default: 127.0.0.1).

    Returns:
        True if the port is in use, False otherwise.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        try:
            s.connect((host, port))
            return True
        except (ConnectionRefusedError, TimeoutError, OSError):
            return False


def find_available_port(start_port: int, max_attempts: int = 100) -> int:
    """
    Find an available port starting from start_port.

    Args:
        start_port: The port to start searching from.
        max_attempts: Maximum number of ports to try.

    Returns:
        An available port number.

    Raises:
        RuntimeError: If no available port is found within max_attempts.
    """
    for offset in range(max_attempts):
        port = start_port + offset
        if not is_port_in_use(port):
            return port
    raise RuntimeError(
        f"Could not find an available port after {max_attempts} attempts starting from {start_port}"
    )


def validate_release_build(build_directory: Path, backend_port: int) -> None:
    """Reject a reused Next.js build whose saved API route targets another backend."""
    manifest_path = build_directory / "routes-manifest.json"
    rebuild = "Run again without --skip-build to rebuild the frontend."
    try:
        manifest = json.loads(manifest_path.read_text())
    except (OSError, ValueError) as exc:
        raise ValueError(f"Cannot read the frontend build manifest. {rebuild}") from exc

    rewrites = manifest.get("rewrites") if isinstance(manifest, dict) else None
    fallback = rewrites.get("fallback") if isinstance(rewrites, dict) else None
    if not isinstance(fallback, list) or any(
        not isinstance(route, dict) for route in fallback
    ):
        raise ValueError(
            f"The frontend build has invalid API rewrite metadata. {rebuild}"
        )
    api_routes = [route for route in fallback if route.get("source") == "/api/:path*"]
    expected_destination = f"http://127.0.0.1:{backend_port}/:path*"
    if len(api_routes) != 1 or api_routes[0].get("destination") != expected_destination:
        raise ValueError(
            f"The frontend build does not proxy API requests to backend port {backend_port}. "
            f"{rebuild}"
        )


async def run_child_process(command, name, env=None, cwd=None):
    """
    Runs an arbitrary child subprocess (e.g. an evolution script) and waits
    for it to finish.  Stdout/stderr are forwarded to the parent process.
    """
    print(f"[{name}] Starting: {' '.join(command)}")

    try:
        process = await asyncio.create_subprocess_exec(
            *command, env=env, cwd=cwd, stdout=sys.stdout, stderr=sys.stderr
        )
    except FileNotFoundError:
        print(f"[{name}] Error: Command not found: {command[0]}")
        return 1

    try:
        await process.wait()
    except asyncio.CancelledError:
        print(f"[{name}] Stopping...")
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5.0)
            except TimeoutError:
                print(f"[{name}] Force killing...")
                process.kill()
                await process.wait()
        raise

    return process.returncode


async def run_frontend_process(command, name, env=None):
    """
    Runs the frontend subprocess and waits for it to finish.
    """
    print(f"[{name}] Starting: {' '.join(command)}")

    try:
        process = await asyncio.create_subprocess_exec(
            *command, env=env, stdout=sys.stdout, stderr=sys.stderr
        )
    except FileNotFoundError:
        print(f"[{name}] Error: Command not found: {command[0]}")
        return 1

    try:
        await process.wait()
    except asyncio.CancelledError:
        print(f"[{name}] Stopping...")
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5.0)
            except TimeoutError:
                print(f"[{name}] Force killing...")
                process.kill()
                await process.wait()
        raise

    return process.returncode


class AsyncServer(Server):
    """
    Custom Uvicorn Server to allow graceful shutdown within asyncio loop.
    """

    async def serve(self, stop_event=None):
        config = self.config
        if not config.loaded:
            config.load()
        self.lifespan = config.lifespan_class(config)
        await self.startup()
        if stop_event:
            # Create a task that waits for the stop event
            async def wait_for_stop():
                await stop_event.wait()
                self.should_exit = True

            asyncio.create_task(wait_for_stop())

        await self.main_loop()
        await self.shutdown()


async def main():
    # Parse arguments
    parser = argparse.ArgumentParser(
        description="Start the EvoMaestro Interface application"
    )
    parser.add_argument(
        "--shinka-search-root",
        required=True,
        dest="root_directory",
        help="Root directory to search for database files (required)",
    )
    parser.add_argument(
        "--guide-db", help="Path to the fixed mock-guide database (or EVOLVIS_GUIDE_DB)"
    )
    parser.add_argument("--release", action="store_true", help="Run in release mode")
    parser.add_argument(
        "--public-demo",
        action="store_true",
        help="Serve only the selected mock-demo and fixed guide with restricted public actions",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Reuse a production build only if its API proxy matches the selected backend port",
    )
    parser.add_argument(
        "--backend-port",
        type=int,
        default=8000,
        help="Port for the backend (default: 8000)",
    )
    parser.add_argument(
        "--frontend-port",
        type=int,
        default=3000,
        help="Port for the frontend (default: 3000)",
    )
    parser.add_argument(
        "--open",
        dest="open_browser",
        action="store_true",
        help="Open browser on the local machine",
    )
    parser.add_argument(
        "--db",
        type=str,
        default=None,
        help="Path to a specific database file to serve.",
    )
    parser.add_argument(
        "--auto-port",
        action="store_true",
        help="Automatically find available ports if specified ports are in use.",
    )
    parser.add_argument(
        "--example-runner",
        type=str,
        default=None,
        dest="run",
        metavar="SCRIPT",
        help=(
            "Path to a Python evolution script (e.g. run_evo.py) to launch "
            "alongside the UI.  The script runs as a child process; when it "
            "enters interactive keep-alive mode the UI remains connected."
        ),
    )
    parser.add_argument(
        "--runner-args",
        type=str,
        default="",
        dest="run_args",
        help="Extra arguments to pass to the --example-runner script (quoted string).",
    )

    args = parser.parse_args()
    try:
        runner_args = shlex.split(args.run_args)
    except ValueError as exc:
        parser.error(f"Invalid --runner-args: {exc}")

    # 1. Configure Backend
    # Resolve absolute path for SEARCH_ROOT
    backend_app.SEARCH_ROOT = os.path.abspath(args.root_directory)
    if args.guide_db:
        backend_app.GUIDE_DB_PATH = Path(args.guide_db).resolve()
    if not os.path.exists(backend_app.SEARCH_ROOT):
        print(f"Error: Root directory does not exist: {backend_app.SEARCH_ROOT}")
        sys.exit(1)

    callback_token: SecretStr | None = None
    if args.public_demo:
        if not args.db:
            parser.error(
                "--public-demo requires --db pointing to the working mock-demo database"
            )
        mock_runner = (
            Path(__file__).resolve().parents[1]
            / "ShinkaEvolve/examples/interactive_sandbox/run_evo.py"
        )
        if args.run and Path(args.run).resolve() != mock_runner.resolve():
            parser.error(
                "--public-demo supports only the interactive sandbox mock runner"
            )
        callback_token = SecretStr(secrets.token_urlsafe(32))
        try:
            backend_app.configure_public_demo(
                Path(args.db).resolve(), callback_token.get_secret_value()
            )
        except ValueError as exc:
            parser.error(str(exc))

    print(f"[System] Backend Search Root: {backend_app.SEARCH_ROOT}")

    # 2. Check port availability
    backend_port = args.backend_port
    frontend_port = args.frontend_port

    backend_in_use = is_port_in_use(backend_port)
    frontend_in_use = is_port_in_use(frontend_port)

    if backend_in_use or frontend_in_use:
        if args.auto_port:
            # Automatically find available ports
            if backend_in_use:
                old_port = backend_port
                backend_port = find_available_port(backend_port)
                print(
                    f"[System] Backend port {old_port} is in use, using {backend_port} instead."
                )
            if frontend_in_use:
                old_port = frontend_port
                frontend_port = find_available_port(frontend_port)
                # Make sure frontend port doesn't conflict with backend port
                if frontend_port == backend_port:
                    frontend_port = find_available_port(frontend_port + 1)
                print(
                    f"[System] Frontend port {old_port} is in use, using {frontend_port} instead."
                )
        else:
            # Report the conflict and exit
            print("[System] Port conflict detected:")
            if backend_in_use:
                print(f"  - Backend port {backend_port} is already in use.")
            if frontend_in_use:
                print(f"  - Frontend port {frontend_port} is already in use.")
            print()
            print("Possible solutions:")
            print("  1. Use --auto-port to automatically find available ports")
            print(
                "  2. Specify different ports with --backend-port and --frontend-port"
            )
            print("  3. Stop the process using the conflicting port(s)")
            print()
            # Suggest available ports
            try:
                suggested_backend = (
                    find_available_port(backend_port)
                    if backend_in_use
                    else backend_port
                )
                suggested_frontend = (
                    find_available_port(frontend_port)
                    if frontend_in_use
                    else frontend_port
                )
                if suggested_frontend == suggested_backend:
                    suggested_frontend = find_available_port(suggested_frontend + 1)
                print("Suggested command:")
                print(
                    f"  uv run --locked --all-packages python start.py --shinka-search-root {args.root_directory} --backend-port {suggested_backend} --frontend-port {suggested_frontend}"
                )
            except RuntimeError:
                pass
            sys.exit(1)

    # 3. Configure Frontend Environment
    env = os.environ.copy()
    # The frontend must never receive the runner's private callback credential.
    for key in (
        "EVOMAESTRO_CALLBACK_TOKEN",
        "EVOMAESTRO_DEMO_DB",
        "EVOMAESTRO_PUBLIC_DEMO",
    ):
        env.pop(key, None)
    if args.public_demo:
        env["EVOMAESTRO_PUBLIC_DEMO"] = "1"
    backend_url = f"http://127.0.0.1:{backend_port}"
    env["API_PROXY"] = backend_url
    # Export for ShinkaEvolve runners so they can push lifecycle callbacks
    # to the backend without explicit configuration.
    env["EVOLVE_SHELL_URL"] = backend_url

    # Check for bun
    if not shutil.which("bun"):
        print("[System] Error: 'bun' is not installed or not in PATH.")
        sys.exit(1)

    # 4. Build step (if release)
    if args.release:
        if args.skip_build:
            try:
                validate_release_build(Path(".next"), backend_port)
            except ValueError as exc:
                parser.error(str(exc))
            print("[System] Reusing frontend build with matching API proxy.")
        else:
            print("[System] Building frontend...")
            build_proc = await asyncio.create_subprocess_exec(
                "bun", "run", "build", env=env, stdout=sys.stdout, stderr=sys.stderr
            )
            await build_proc.wait()
            if build_proc.returncode != 0:
                print("[System] Build failed. Exiting.")
                sys.exit(build_proc.returncode)

        frontend_cmd = ["bun", "run", "start", "--", "-p", str(frontend_port)]
    else:
        frontend_cmd = ["bun", "run", "dev", "--", "-p", str(frontend_port)]

    # 5. Prepare Tasks
    stop_event = asyncio.Event()

    # -- Backend Task
    config = Config(
        app=backend_app.app,
        host="127.0.0.1",
        port=backend_port,
        log_level="info",
        timeout_graceful_shutdown=1,  # don't hang on open WS connections
    )
    server = AsyncServer(config=config)
    backend_task = asyncio.create_task(server.serve(stop_event))

    # -- Frontend Task
    frontend_task = asyncio.create_task(
        run_frontend_process(frontend_cmd, "Frontend", env=env)
    )

    # -- Evolution runner task (optional, launched via --run)
    evo_task = None
    if args.run:
        run_script = os.path.abspath(args.run)
        if not os.path.exists(run_script):
            print(f"[System] Error: evolution script not found: {run_script}")
            sys.exit(1)
        run_cwd = os.path.dirname(run_script)
        run_cmd = [sys.executable, run_script, "--interactive"]
        run_cmd += runner_args
        runner_env = env.copy()
        if callback_token is not None:
            runner_env["EVOMAESTRO_CALLBACK_TOKEN"] = callback_token.get_secret_value()
        evo_task = asyncio.create_task(
            run_child_process(run_cmd, "Evolution", env=runner_env, cwd=run_cwd)
        )

    # 6. Print banner & open browser
    frontend_url = f"http://localhost:{frontend_port}"
    if args.db:
        params = urllib.parse.urlencode({"db_path": args.db})
        frontend_url = f"{frontend_url}/?{params}"

    def print_banner():
        print()
        print("=" * 60)
        print("  EvoMaestro Interface")
        print("-" * 60)
        print(f"  Frontend : {frontend_url}")
        print(f"  Backend  : {backend_url}")
        print(f"  Search   : {backend_app.SEARCH_ROOT}")
        if args.run:
            print(f"  Runner   : {os.path.abspath(args.run)}")
        print("=" * 60)
        print()

    print_banner()

    if args.open_browser:

        async def open_browser_delayed():
            await asyncio.sleep(2)
            print(f"[System] Opening {frontend_url} in browser")
            try:
                webbrowser.open_new_tab(frontend_url)
            except Exception as e:
                print(f"[System] Could not open browser: {e}")

        asyncio.create_task(open_browser_delayed())

    # 8. Signal Handling
    loop = asyncio.get_running_loop()

    def handle_signal():
        print("\n[System] Signal received, shutting down...")
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, handle_signal)

    # 9. Monitor Loop
    # Wait until one task finishes or stop signal
    pending = {backend_task, frontend_task}
    if evo_task is not None:
        pending.add(evo_task)

    try:
        while backend_task in pending or frontend_task in pending:
            # Check if stop_event was triggered externally (signal)
            if stop_event.is_set():
                break

            done, pending = await asyncio.wait(
                pending, return_when=asyncio.FIRST_COMPLETED
            )

            for task in done:
                if task == evo_task:
                    # Evolution script finished — this is NORMAL.
                    # The backend + frontend keep running so the user
                    # can still browse results / submit interactive commands
                    # if the runner entered keep-alive mode.
                    rc = task.result()
                    print(
                        f"[System] Evolution script exited (rc={rc}). "
                        "Backend & UI remain running."
                    )
                    print_banner()
                elif task == frontend_task:
                    print("[System] Frontend process exited. Shutting down backend...")
                    stop_event.set()
                    if backend_task in pending:
                        await backend_task
                elif task == backend_task:
                    print("[System] Backend server stopped. Shutting down frontend...")
                    if frontend_task in pending:
                        frontend_task.cancel()
                        try:
                            await frontend_task
                        except asyncio.CancelledError:
                            pass

            if not pending:
                break

    finally:
        # Cleanup
        print("[System] Cleaning up...")
        if not stop_event.is_set():
            stop_event.set()

        # Ensure frontend is cancelled
        if not frontend_task.done():
            frontend_task.cancel()
            try:
                await frontend_task
            except asyncio.CancelledError:
                pass

        # Ensure backend finishes its shutdown
        if not backend_task.done():
            await backend_task

        # Ensure evo script is stopped
        if evo_task is not None and not evo_task.done():
            evo_task.cancel()
            try:
                await evo_task
            except asyncio.CancelledError:
                pass

        print("[System] Shutdown complete.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
