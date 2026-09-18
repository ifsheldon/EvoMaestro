# EvoMaestro

**Understand and steer LLM-driven program evolution.**

EvoMaestro is a visual interface for exploring how a population of programs evolves and guiding what it tries next.
Built on ShinkaEvolve, it connects population structure, algorithmic ideas, source code, and evaluation results so you can inspect promising strategies and intervene during a run.

[Paper (UIST 2026)](https://www.researchgate.net/publication/414382819_EvoMaestro_Toward_Interpretable_and_Steerable_LLM-Driven_Program_Evolution) · [Online demo](https://evomaestro-demo.reify.ing) · [简体中文](README.zh-CN.md) · [Quick start](#quick-start) · [Datasets](#datasets)

## What you can do

- **Explore an evolution run:** follow ancestry, islands, crossover events, and the path to the best program in the tree and program views.
- **Compare strategies:** inspect code, diffs, prompts, logs, and scores; use code or reasoning embeddings to explore clusters and dissimilarity.
- **Steer the search:** suggest changes, merge complementary programs, ban or restore candidates, and control a connected runner with Start, Pause, Continue, and Step.
- **Focus your review:** prioritize noteworthy programs using score changes, embedding dissimilarity, or a custom rule; adjust the quality–diversity balance for Merge recommendations.
- **Get context:** read evolution summaries and discuss experiments, individual programs, or diffs with Maestro Chat.
- **Learn in either language:** use the English or Simplified Chinese interface and an interactive guide with a fixed example dataset.

## Quick start

The mock demo simulates evolution, embeddings, and evaluation scores without model API calls.
It is the simplest way to try the interface.

### 1. Install

Requirements: Git, [uv](https://docs.astral.sh/uv/), [Bun](https://bun.sh/) 1.4 or newer, and [Node.js](https://nodejs.org/) 22.22.1 or newer.
The Python workspace uses Python 3.12 or newer; uv manages its environment.

```sh
git clone --recurse-submodules https://github.com/ifsheldon/EvoMaestro.git
cd EvoMaestro
uv sync --locked --all-packages
bun install --frozen-lockfile
```

Use `--all-packages` with both `uv sync` and `uv run` to include the interface's FastAPI and Uvicorn dependencies alongside ShinkaEvolve.
The shared lockfile records every workspace member, but root commands without this flag select only the root project's dependencies.

Keep the pinned `ShinkaEvolve` submodule revision: it includes EvoMaestro's interactive integration.

### 2. Use the bundled examples

All four datasets are included in the checkout: MOP, GraphMOP, `mock-demo`, and `mock-guide`.
No separate data download is needed.

```text
EvoMaestro/
└── datasets/
    ├── MOP/                       # benchmark code + two recorded runs
    │   ├── run_evo_explicit_50g.py
    │   └── results_50g_runs/run_*/programs.sqlite
    ├── GraphMOP/                  # benchmark code + one recorded run
    │   ├── run_evo_explicit_50g.py
    │   └── results_50g_runs/run_*/programs.sqlite
    ├── mock-demo/programs.sqlite
    └── mock-guide/programs.sqlite
```

Keep each complete dataset directory and its recorded run artifacts.
The mock datasets also include `dataset.json`, which records their demo and guide roles.
See [bundled datasets](datasets/README.md) for usage details.
The selected [online demo address](https://evomaestro-demo.reify.ing) is shared with the publication website; deployment verification is still pending.

### 3. Start the mock demo

Run from the repository root:

```sh
uv run --locked --all-packages python evomaestro-interface/tools/start_mock_demo.py --release
```

Open [localhost:3000](http://localhost:3000).
The launcher builds the frontend and starts the frontend, backend, and mock evolution runner together.
Click **Start** to evolve the five initial nodes, or **Guide** to explore the populated walkthrough example.
The guide restores your previous dataset and view when you finish or exit.

Each launch creates a fresh working copy under the ignored `mock-runs/` directory in the checkout and prints its location.
That copy is retained after shutdown; the packaged snapshots remain unchanged.
Press `Ctrl+C` in the launcher terminal to stop the services.

Maestro Chat remains visible but locked for `mock-demo`, including local deployments, so the demo cannot consume the host's ChatGPT subscription through chat.
Mock evolution and the guide require no API keys.
See [Mock examples](docs/guides/mock-examples.md) for resuming a working copy and preparing fixtures.

## Datasets

| Dataset | Recorded programs | Purpose |
|---|---:|---|
| **MOP** | 58 and 56 in two runs | Drone path optimization across path length, noise, and signal risk. |
| **GraphMOP** | 56 | Task routing on a graph, balancing delay and energy use. |
| **mock-demo** | 5 | Initial island nodes for interactive, simulated evolution. |
| **mock-guide** | 38 | A fixed walkthrough example with existing branches, crossover, and an illustrative bilingual summary. |

The mock scores and guide summary are illustrative; they are not benchmark results.
`mock-guide` is read-only and opens through **Guide**, rather than the normal dataset selectors.

### Browse recorded runs

MOP includes two recorded runs with 58 and 56 programs; GraphMOP includes one with 56 programs.
Each benchmark directory contains its runnable task code and complete recorded run directories under `results_50g_runs/`.

From the repository root:

```sh
cd evomaestro-interface
uv run --locked --all-packages python start.py \
  --shinka-search-root ../datasets \
  --guide-db ../datasets/mock-guide/programs.sqlite \
  --frontend-port 3000 --backend-port 8001 \
  --release
```

Select MOP or GraphMOP in the dataset controls.
This command starts the interface without an evolution runner; Continue and Step need a connected runner to generate new programs.
With a connected runner, Step submits one additional proposal and then pauses further submissions, extending an exhausted target when needed.
Evaluations already in flight may still finish.
Browsing existing runs requires no model API keys.

## Run real evolution

Real evolution uses the providers configured by the selected runner and incurs their API charges.
The supplied MOP and GraphMOP explicit runners require `OPENAI_API_KEY`; other configurations may also require `GEMINI_API_KEY`.

If you have not created a local configuration yet, run this from the repository root, then fill in the required keys:

```sh
cp .env.example .env
```

To launch a new MOP run together with the interface, start from the repository root:

```sh
cd evomaestro-interface
uv run --locked --all-packages python start.py \
  --shinka-search-root ../datasets/MOP \
  --guide-db ../datasets/mock-guide/programs.sqlite \
  --example-runner ../datasets/MOP/run_evo_explicit_50g.py \
  --frontend-port 3000 --backend-port 8001 \
  --release
```

For GraphMOP, replace both MOP paths with their GraphMOP equivalents.
The launcher connects the runner to the interface and enables interactive controls.
To continue a bundled run, copy one complete run directory from `datasets/MOP/results_50g_runs/` or `datasets/GraphMOP/results_50g_runs/` to a new working directory outside `datasets/`.
Use the corresponding runner, set the search root to the working directory’s parent, and add `--runner-args "--resume /absolute/path/to/working-run"`.
Keep the bundled snapshots unchanged; real generation still requires your own provider API credentials.
The representative MOP/GraphMOP resume smoke test remains a release validation item.

Task definitions and evaluation details are in [MOP](datasets/MOP/README.md) and [GraphMOP](datasets/GraphMOP/README.md).

### Use Maestro Chat locally

Maestro Chat uses the Codex SDK and the Codex authentication on the machine running EvoMaestro.
Set up Codex using the [official authentication guide](https://learn.chatgpt.com/docs/auth#sign-in-with-chatgpt), then sign in with your own ChatGPT account:

```sh
codex login
```

Open an ordinary experiment such as MOP or GraphMOP to use experiment, code, or diff chat.
Both mock datasets keep their chat restrictions.
ChatGPT subscription access for Maestro Chat is separate from the provider API credentials used by real evolution.
Clear conversation cancels its active turn and forgets the saved thread binding, so the next message starts a new conversation; the host’s original Codex session files remain on disk.

## Current limitations and future work

- **Cluster filters:** filters keep the full-population PCA layout so visible nodes retain their positions and spatial context.
  Hidden programs still influence the stored projection; filtering does not recompute coordinates.
- **Public hosting:** use `uv run --locked --all-packages poe start-mock-interactive-published` for the shared anonymous demo.
  Its explicit `--public-demo` policy confines HTTP/WebSocket access to the mock working copy and fixed guide, disables Maestro, and authenticates private runner callbacks.
  Visitors share controls and progress; configure DNS, TLS, proxy routing, and rate limits on the hosting server.
  Ordinary local mode remains for trusted users, and `--release` alone only builds the optimized frontend.
- **Scale and explanations:** the evaluation used 50-node trees and the system demonstration reached approximately 200 nodes; larger populations remain unvalidated, and generated explanations can be incorrect.
  Code, diffs, and evaluation results remain available for inspection.

Future research directions include steering groups of related nodes, suggesting or triggering pauses when evolution converges, clearer provenance for generated explanations, and aggregation for much larger evolution trees.
These are not implemented features or committed release dates.
See the [release checklist](docs/maintenance/release-checklist.md) for outstanding source fixes and publication checks.
The planned demo address is `https://evomaestro-demo.reify.ing`; [deployment routing](docs/guides/mock-examples.md#single-origin-demo-routing) documents the public-demo policy and deployment requirements.

## Development

The repository contains a Next.js/React frontend and FastAPI backend in `evomaestro-interface/`, the ShinkaEvolve integration as a submodule, and the benchmark harnesses.
The repository root is a Bun workspace with `evomaestro-interface` and `project-page` as its members.
`project-page/` contains the separate public project website; see its [development guide](project-page/README.md).
JavaScript dependencies share the root `bun.lock` and are hoisted into the root `node_modules/`; Bun keeps incompatible versions in workspace-local `node_modules/` when needed.
Python dependencies share the root `uv.lock`.
Run `bun install --frozen-lockfile` from the repository root; the install also configures the Git hooks.
Recorded run artifacts and mock snapshots under `datasets/` are excluded from Ruff linting and formatting; the MOP and GraphMOP harness code remains included.

Run frontend checks from `evomaestro-interface/`:

```sh
bun test
bunx --no-install tsc --noEmit
bunx --no-install biome check
bun run build
```

Start with the [documentation index](docs/README.md).
See the [frontend and backend development guide](evomaestro-interface/README.md), [interface architecture](evomaestro-interface/architecture.md), [ShinkaEvolve integration](docs/architecture/shinka-evolve.md), and [reasoning embedding policy](docs/architecture/reasoning-embeddings.md) for details.

## Citation

```bibtex
@inproceedings{liang2026evomaestro,
  author = {Liang, Feng and Cheng, Sizhe and Li, Yikai and He, Ruijie and Wen, Xiaolin and Wang, Yong},
  title = {{EvoMaestro}: Toward Interpretable and Steerable {LLM}-Driven Program Evolution},
  booktitle = {The 39th Annual ACM Symposium on User Interface Software and Technology},
  series = {UIST '26},
  year = {2026},
  doi = {10.1145/3830398.3830626}
}
```

## License and acknowledgments

EvoMaestro's source code is available under the [MIT License](LICENSE).
The [ShinkaEvolve submodule](ShinkaEvolve/) retains its [Apache 2.0 license](ShinkaEvolve/LICENSE).
EvoMaestro builds on ShinkaEvolve and the program-evolution approach demonstrated by AlphaEvolve.

Reference papers and extracted figures in `docs/reference-papers/` retain their original authorship and notices; they are not covered by EvoMaestro's MIT license.
