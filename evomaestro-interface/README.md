# EvoMaestro Interface

The frontend and backend for EvoMaestro, built with Next.js and FastAPI.
Start with the repository's [public README](../README.md) for installation, example data, and the mock demo, or [简体中文](../README.zh-CN.md) for the same instructions in Chinese.

## Features

- **Evolution views**: Explore the tree, program table, clusters, and path to the best program.
- **Program inspection**: Compare code and diffs, scores, prompts, logs, and evaluation results.
- **Interactive steering**: Suggest, Merge, Ban, and control a connected evolution runner.
- **Review and explanation**: Configure review priorities, read evolution summaries, and use Maestro Chat on ordinary datasets.
- **Bilingual onboarding**: Use English or Simplified Chinese and the fixed mock-guide walkthrough.

With a connected runner, Step submits one additional proposal and then pauses further submissions.
It extends the target when needed, so it also works after the current target is reached; evaluations already in flight may still finish.

## Prerequisites

- [Bun](https://bun.sh/) 1.4 or newer
- [Node.js](https://nodejs.org/) 22.22.1 or newer, required by the frontend tooling
- [uv](https://github.com/astral-sh/uv)
- Python 3.12 or newer, managed by uv

## Getting Started

1. **Install Dependencies**:

    ```bash
    # Run from the repository root
    cd ..
    bun install --frozen-lockfile
    uv sync --locked --all-packages
    cd evomaestro-interface
    ```

2. **Start the Application**:

    Use the `start.py` script to run both backend and frontend with a single command:

    ```bash
    # Basic usage (defaults: Backend 8000, Frontend 3000)
    uv run --locked --all-packages python start.py --shinka-search-root ./my_results_dir

    # Auto-open browser
    uv run --locked --all-packages python start.py --shinka-search-root ./my_results_dir --open

    # Custom ports
    uv run --locked --all-packages python start.py --shinka-search-root ./my_results_dir --backend-port 8005 --frontend-port 3005

    # Auto-find available ports if defaults are in use
    uv run --locked --all-packages python start.py --shinka-search-root ./my_results_dir --auto-port
    ```

    The script automatically sets up the environment so the frontend can talk to the backend.

    **Port Conflict Detection**: The script checks if the specified ports are already in use before starting. If a conflict is detected:
    - Without `--auto-port`: Shows an error with suggested available ports
    - With `--auto-port`: Automatically finds and uses available ports

3. **Production Mode**:

    To run with a built frontend (optimized):

    ```bash
    uv run --locked --all-packages python start.py --shinka-search-root ./my_results_dir --release
    ```

    `--release --skip-build` reuses a build only when its saved API proxy matches the final backend port, including a port chosen by `--auto-port`.
    A missing, malformed, or mismatched build fails before services start; rerun without `--skip-build` to rebuild.
    The launcher preserves quoted `--runner-args`, including working-copy paths containing spaces.

4. **Anonymous mock hosting**:

    From the repository root, use `uv run --locked --all-packages poe start-mock-interactive-published`.
    This selects `--release --public-demo`; see the [public-demo policy](../docs/guides/mock-examples.md#single-origin-demo-routing) before configuring the external proxy.

## Dependency Maintenance

The repository root is a [Bun workspace](https://bun.sh/docs/pm/workspaces) with `evomaestro-interface` and `project-page` as its members.
Use the repository-root `bun.lock` for JavaScript dependencies and `uv.lock` for Python dependencies.
Run `bun install --frozen-lockfile` from the root; `bunfig.toml` hoists shared dependencies into the root `node_modules/`, and the root `prepare` script configures the interface Git hooks.
Bun may install incompatible versions in a member’s local `node_modules/`; these are required dependencies, not stale standalone installs.
Keep application dependencies in this directory's `package.json`; run `bun add <package>` here to update the shared lockfile.
The Python workspace shares packages with ShinkaEvolve, so targeted upgrades must satisfy its existing constraints without changing the submodule's manifests.
Use `uv sync --locked --all-packages` for installation and `uv run --locked --all-packages` for commands so every workspace member's dependencies, including FastAPI and Uvicorn, are selected consistently.
The root project's dependencies alone do not include the interface backend, even though those packages appear in the shared lockfile.

Run the frontend checks from this directory:

```bash
bun test
bunx --no-install tsc --noEmit
bunx --no-install biome check
bun run build
```

Run the backend integration tests from the repository root:

```bash
uv run --locked --all-packages pytest evomaestro-interface/backend/test_review_prioritization.py
```

For concurrent work on ShinkaEvolve, set `UV_PROJECT_ENVIRONMENT` to a separate environment path when syncing and running Python checks.
This lets each checkout's lockfile determine its validation environment without replacing packages in another active environment.

## Project Structure

- `src/`: Next.js frontend source code.
  - `components/`: React components (Sidebar, TreeVisualization, DetailsPanel).
  - `lib/`: API client and utilities.
- `backend/`: Python FastAPI backend.
  - `main.py`: API server entry point.
