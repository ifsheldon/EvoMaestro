"""Launch a fresh working copy of mock-demo with the UI and its mock runner."""

from __future__ import annotations

import argparse
import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

from prepare_mock_datasets import REPO, copy_run


def main() -> None:
    """Keep release snapshots fixed while connecting a live demo runner."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--release-data",
        type=Path,
        default=REPO / "datasets",
        help="Directory containing mock-demo and mock-guide (default: datasets/)",
    )
    parser.add_argument("--frontend-port", type=int, default=3000)
    parser.add_argument("--backend-port", type=int, default=8001)
    parser.add_argument("--release", action="store_true")
    parser.add_argument(
        "--public-demo",
        action="store_true",
        help="Restrict anonymous hosting to this working mock-demo and its fixed guide",
    )
    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()
    data = args.release_data.resolve()
    for name in ("mock-demo", "mock-guide"):
        if not (data / name / "programs.sqlite").is_file():
            parser.error(
                f"Missing {name}/programs.sqlite in the release data directory"
            )
    runs = data.parent / "mock-runs"
    runs.mkdir(exist_ok=True)
    working = Path(tempfile.mkdtemp(prefix="demo-", dir=runs))
    copy_run(data / "mock-demo", working / "mock-demo")
    runner = REPO / "ShinkaEvolve/examples/interactive_sandbox/run_evo.py"
    command = [
        sys.executable,
        "start.py",
        "--shinka-search-root",
        str(working),
        "--guide-db",
        str(data / "mock-guide/programs.sqlite"),
        "--example-runner",
        str(runner),
        "--runner-args",
        shlex.join(["--resume", "--results-dir", str(working / "mock-demo")]),
        "--frontend-port",
        str(args.frontend_port),
        "--backend-port",
        str(args.backend_port),
    ]
    if args.release:
        command.append("--release")
    if args.public_demo:
        command.extend(
            ["--public-demo", "--db", str(working / "mock-demo/programs.sqlite")]
        )
    if args.skip_build:
        command.append("--skip-build")
    print(f"Mock working copy: {working}", flush=True)
    subprocess.run(
        command,
        cwd=REPO / "evomaestro-interface",
        env={**os.environ, "SHINKA_PRICING_MODE": "offline"},
        check=True,
    )


if __name__ == "__main__":
    main()
