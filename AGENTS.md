# For Agents

## Documents

See the [documentation index](./docs/README.md) and [documentation maintenance rules](./docs/AGENTS.md).

## Requirements

1. Before starting writing or modifying any code in this repository, make sure you understand AlphaEvolve and ShinkaEvolve by reading the refererces:

   - [AlphaEvolve blog](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/)
   - [AlphaEvolve paper markdown](./docs/reference-papers/alpha-evolve/AlphaEvolve.md)
   - [ShinkaEvolve paper markdown](./docs/reference-papers/shinka-evolve/shinka_evolve.md)
   - [ShinkaEvolve architecture](./docs/architecture/shinka-evolve.md)

2. Before implementing features, read the [frontend/backend architecture](./evomaestro-interface/architecture.md).
3. For new Python code, always add proper docstrings and type hints.
4. We use `uv` to manage the Python environment and dependencies, never use `pip` or `conda` directly.
5. Update the matching architecture or workflow documentation when behavior changes.

## Technical Requirements

- Use `uv` to manage the Python environment and dependencies, never use `pip` or `conda` directly.
  - Use `uv add <package_name>` to add a new dependency.
  - Use `uv sync --locked --all-packages` to install the dependencies.
  - Use `uv run --locked --all-packages python some_file.py` to run a Python file.
- Use `bun` to manage the JavaScript environment and dependencies, never use `npm` or `yarn` directly.
  - Run `bun install --frozen-lockfile` from the repository root, which owns the Bun workspace and shared lockfile.
  - Use `bun add <package_name>` to add a new dependency.
  - Use `bun run <script_name>` to run a JavaScript script.

## Tips

- If you cannot run Python code like `python some_file.py`, try to run `uv run --locked --all-packages python some_file.py` instead.
- `pyproject.toml` contains useful poe commands.
- To add a new dependency, you can run `uv add <package_name>` to add it to the `pyproject.toml` file.
- Ask any questions if you are not sure.
