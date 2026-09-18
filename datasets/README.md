# Bundled datasets

[简体中文](README.zh-CN.md)

| Directory | Programs | Purpose |
| --- | ---: | --- |
| `MOP/` | 58 and 56 | Drone path optimization code and two recorded runs. |
| `GraphMOP/` | 56 | Graph task-routing code and one recorded run. |
| `mock-demo/` | 5 | Initial island nodes for simulated interactive evolution. |
| `mock-guide/` | 38 | Fixed walkthrough snapshot with an illustrative bilingual summary. |

MOP and GraphMOP include the evaluation code, initial program, runners, and these complete run directories:

- `MOP/results_50g_runs/run_20260319_080103/`: 58 programs.
- `MOP/results_50g_runs/run_20260319_182915/`: 56 programs.
- `GraphMOP/results_50g_runs/run_20260319_183058/`: 56 programs.

Each run includes `programs.sqlite` and its recorded configuration, generated programs, evaluation results, summaries, and logs.
The two MOP databases use the current review-prioritization schema after migration; original database backups remain outside the repository.
Their review-metric caches were filled offline on 2026-09-18, with one row for each of the 58 and 56 programs and 49 non-null reasoning distances in each run.
The repair preserves every program field, historical priority assignment, and unrelated table; changing review settings can now recalculate priorities for all nodes.
Backups and validation evidence remain outside the repository; see the [metrics-only repair workflow](../docs/architecture/reasoning-embeddings.md#missing-review-metric-rows).
Historical configuration and logs retain their original paths; use the adjacent runner scripts when starting or resuming evolution.
New run directories, evaluation scratch output, Python caches, and SQLite sidecars remain ignored by Git.
The mock snapshots also include `dataset.json` to declare their roles.
Mock scores and summaries are illustrative, not research results.
The guide is read-only, and Maestro Chat is locked for mock datasets.

## Browse recorded runs

From the repository root:

```sh
cd evomaestro-interface
uv run --locked --all-packages python start.py \
  --shinka-search-root ../datasets \
  --guide-db ../datasets/mock-guide/programs.sqlite \
  --frontend-port 3000 --backend-port 8001 --release
```

Open `http://localhost:3000` and select MOP or GraphMOP.
Browsing requires no model API keys and does not start evolution.
To continue a recorded run, copy its complete `results_50g_runs/run_*/` directory to a new working location outside `datasets/`, then launch its MOP or GraphMOP runner with `--interactive --resume /absolute/path/to/working-run`.
Real evolution requires your own provider credentials and incurs API costs; see [running real evolution](../README.md#run-real-evolution).

## Start the mock demo

From the repository root, start a fresh demo with:

```sh
uv run --locked --all-packages python evomaestro-interface/tools/start_mock_demo.py --release
```

The launcher copies `mock-demo` to an ignored `mock-runs/demo-*/mock-demo/` directory before starting evolution, and uses the fixed `mock-guide` here.
Keep these bundled snapshots unchanged; resume a working copy to retain your own progress.
See [the public README](../README.md#datasets) and [mock workflow](../docs/guides/mock-examples.md).
