# ShinkaEvolve Architecture Overview

## Scope

This document describes the architecture of the vendored `ShinkaEvolve` code in this repository as of July 27, 2026. It reflects:

- upstream `ShinkaEvolve` after the major `v1.1` upgrade and subsequent refactoring
- the interactive port that merged interactive steering into the async-first codebase
- the repo-local additions built around `evomaestro-interface` and Maestro-assisted analysis

The synchronous `EvolutionRunner` (`runner.py`) has been removed. The async runner is now the sole runtime, with interactive steering provided by a dedicated subclass.

## Architectural Summary

At a high level, the current system is four connected subsystems:

1. **Evolution runtimes**
   - Generate, mutate, evaluate, and archive candidate programs.
2. **Persistence and search state**
   - Store programs, prompt lineages, embeddings, archive membership, islands, review priorities, and run-control messages in SQLite-backed state.
3. **Model services**
   - Route LLM and embedding requests through provider-specific clients, bandit selection, novelty checks, and meta reasoning.
4. **Observation and interaction**
   - Expose results through legacy visualization, the newer `evomaestro-interface` UI, push-based WebSocket updates via HTTP callbacks, interactive run control, and Maestro chat overlays.

## What Changed Since the Older Design

The biggest architectural shifts are:

- **Async execution is the only runtime.**
  - `ShinkaEvolveRunner` (formerly `AsyncEvolutionRunner`) is the sole runner. The synchronous `EvolutionRunner` has been removed. `EvolutionConfig` now lives in its own `config.py` module.
- **Prompt co-evolution is now a real subsystem.**
  - System prompts can evolve in their own archive and are linked back to generated programs through `system_prompt_id`.
- **Novelty rejection and expert review prioritization are separate pipelines.**
  - Pre-evaluation novelty rejection still happens through `NoveltyJudge` and can prevent duplicate candidates from being evaluated.
  - Post-evaluation expert review prioritization happens through `ReviewPrioritizer`, including hot-reloadable user-defined prioritization functions. It only routes expert attention and does not change scores, parent selection, or candidate acceptance.
- **The provider stack was refactored.**
  - LLMs and embeddings now resolve through provider-based modules instead of the older hard-wired layout.
- **The database layer does more.**
  - Dynamic island spawning, island sampling strategies, prompt databases, richer metadata, and concurrency-safe async wrappers were added.
- **The UI story changed.**
  - The legacy `shinka/webui` still exists, but this repo now also contains `evomaestro-interface`, a newer FastAPI + Next.js interface with live run control and Maestro integration.

## Top-Level System Map

| Layer | Main modules | Responsibility |
| --- | --- | --- |
| Launch and configuration | `ShinkaEvolve/shinka/cli/run.py`, `ShinkaEvolve/shinka/cli/launch.py`, `ShinkaEvolve/shinka/core/config.py` | Start runs from Hydra configs or task directories, wire evaluation entrypoints, and hold `EvolutionConfig`. |
| Base runtime | `ShinkaEvolve/shinka/core/async_runner.py` (`ShinkaEvolveRunner`) | High-throughput proposal/evaluation pipeline with async scheduling, prompt co-evolution, and committed-cost control. |
| Interactive runtime | `ShinkaEvolve/shinka/core/async_interactive_runner.py` (`ShinkaEvolveInteractiveRunner`) | Extends the base runner with human steering via SQLite-based interactive command/status tables. |
| Search state | `ShinkaEvolve/shinka/database/` | Program archive, islands, sampling, migrations, prompt archive, async DB adapter, and display utilities. |
| Prompting and editing | `ShinkaEvolve/shinka/core/sampler.py`, `ShinkaEvolve/shinka/edit/`, `ShinkaEvolve/shinka/core/prompt_evolver.py` | Build prompts, run diff/full/cross/fix mutations, summarize edits, and evolve system prompts. |
| Evaluation | `ShinkaEvolve/shinka/core/wrap_eval.py`, `ShinkaEvolve/shinka/launch/scheduler.py` | Execute generated programs locally or through Slurm and aggregate metrics. |
| Model services | `ShinkaEvolve/shinka/llm/`, `ShinkaEvolve/shinka/embed/` | Resolve providers, query LLMs, compute embeddings, track cost, and run bandit model selection. |
| Novelty, review prioritization, and meta reasoning | `ShinkaEvolve/shinka/core/novelty_judge.py`, `ShinkaEvolve/shinka/core/review_prioritizer.py`, `ShinkaEvolve/shinka/core/summarizer.py`, `ShinkaEvolve/shinka/core/async_summarizer.py` | Reject duplicate proposals, assign review priorities to evaluated programs, and synthesize recommendations over the run history. |
| Push-based event delivery | `ShinkaEvolve/shinka/core/event_notifier.py` | Fire-and-forget HTTP callbacks for `program.queued` and `program.generated` lifecycle events to the evomaestro-interface backend. |
| Visualization and interaction | `ShinkaEvolve/shinka/webui/visualization.py`, `evomaestro-interface/`, `ShinkaEvolve/shinka/interactive/` | Inspect runs, stream updates, steer the runner, and analyze nodes/code changes. |

## Runtime Variants

There are now two runners, one extending the other. The synchronous `EvolutionRunner` (`runner.py`) has been removed.

### 1. `ShinkaEvolveRunner`: base async pipeline

`ShinkaEvolve/shinka/core/async_runner.py`

This is the sole base runtime:

- separates proposal generation from evaluation monitoring via concurrent asyncio tasks
- uses concurrent proposal tasks to keep the evaluation pipeline full
- wraps the main database through `AsyncProgramDatabase` for thread-safe async access
- supports prompt co-evolution through `SystemPromptDatabase`
- uses committed-cost estimation to stop generating new proposals before API budget overshoot
- persists richer run state for resume behavior (bandit state, API costs, generation counter)
- accepts `patch_type_override` and `user_suggestions` in `_run_patch_async` for interactive steering passthrough
- assigns post-evaluation review priorities via `ReviewPrioritizer`
- supports per-evaluation timeout via `eval_timeout` config
- pushes `program.queued` and `program.generated` lifecycle events to a configured callback URL via `EventNotifier`, enabling real-time frontend updates without polling

Constructor parameters control concurrency:

- `max_evaluation_jobs`: concurrent evaluation processes (CPU-bound)
- `max_proposal_jobs`: concurrent LLM proposal tasks (I/O-bound)
- `max_db_workers`: thread pool size for async DB access

Configuration is defined in `ShinkaEvolve/shinka/core/config.py` (`EvolutionConfig`), separate from the runner class. Notable fields include `callback_url` for push-based frontend updates (falls back to the `EVOLVE_SHELL_URL` environment variable), `reasoning_embed_sim_threshold` and `use_reasoning_novelty` for reasoning-embedding-based novelty rejection.

### 2. `ShinkaEvolveInteractiveRunner`: async pipeline plus human steering

`ShinkaEvolve/shinka/core/async_interactive_runner.py`

This subclass adds three capabilities on top of `ShinkaEvolveRunner`:

- a concurrent `_interactive_command_task` that polls the SQLite command queue and dispatches interactive actions (suggest, merge, set_target, pause, resume, step, stop)
- interaction-mode gating in the proposal coordinator via an asyncio `Event` pause gate that controls when automatic proposals are generated
- a keep-alive loop that keeps the runner alive after scheduled generations complete so experts can continue submitting suggestions, merges, or extend the target

Key behaviors:

- on resume, the runner starts **paused** so the user can review state before continuing
- on target increase, the runner **pauses** and waits for an explicit Continue rather than auto-starting
- Step submits one additional proposal then auto-pauses; at an exhausted target it extends the target to include that proposal, and already-running evaluations may still finish.
- command payloads are validated with Pydantic schemas (`ShinkaEvolve/shinka/interactive/payload_schemas.py`)

This is the recommended runner for research workflows where human steering is desired. It takes the same constructor arguments as the base runner.

## End-to-End Execution Flow

### Base async flow (`ShinkaEvolveRunner`)

1. A launcher creates `EvolutionConfig`, `DatabaseConfig`, and `JobConfig`.
2. `ShinkaEvolveRunner` creates the results directory, `programs.sqlite`, model clients, `PromptSampler`, `MetaSummarizer`, `NoveltyJudge`, `ReviewPrioritizer`, and optionally `SystemPromptDatabase`.
3. If resuming (existing DB with `last_iteration > 0`), bandit state and API costs are restored and generation counters are advanced.
4. Concurrent tasks are started for:
   - proposal coordination
   - job monitoring
   - meta summarization
5. The proposal coordinator keeps the pipeline full up to:
   - `max_evaluation_jobs`
   - `max_proposal_jobs`
   - remaining generation budget
   - committed API cost budget
6. Each proposal task:
   - samples a parent and inspirations from the database
   - can enter fix mode if no correct program exists
   - optionally samples an evolved system prompt
   - builds a prompt with diff/full/cross or fix-mode instructions (with optional `patch_type_override` and `user_suggestions`)
   - queries the chosen LLM
   - applies the mutation asynchronously
   - computes code and reasoning embeddings
   - runs novelty rejection via `NoveltyJudge` (code similarity, and optionally reasoning similarity)
   - submits evaluation to `JobScheduler`
7. The monitor task ingests completed jobs, updates prompt fitness and model-bandit state, writes programs, pushes `program.generated` events via `EventNotifier`, assigns an expert review priority, and advances generation bookkeeping.
8. Prompt evolution is triggered periodically and writes new prompt variants into `prompts.sqlite`.
9. Finalization writes meta outputs, state snapshots, and best-solution artifacts.

### Interactive flow (`ShinkaEvolveInteractiveRunner`)

Extends the base flow with:

1. A 4th concurrent task (`_interactive_command_task`) polls the SQLite command queue.
2. The runner waits for a start signal from either CLI input or the web control plane before entering the generation loop.
3. On resume, the runner starts paused so the user can review, suggest, or merge before continuing.
4. The proposal coordinator checks the pause gate before generating each proposal. In step mode, it auto-pauses after one submission.
5. Interactive commands (suggest, merge, set_target) are dispatched as they arrive, injecting `patch_type_override` and `user_suggestions` into proposal generation.
6. After scheduled generations finish, the runner enters a keep-alive loop so experts can continue steering or extend the target. On target increase, the runner pauses and waits for an explicit Continue.

## Core Search-State Architecture

### Program archive and runtime DB

`ShinkaEvolve/shinka/database/dbase.py`

`ProgramDatabase` is the central state container for evolution. It stores:

- code and lineage
- scores and correctness
- public and private metrics
- code embeddings and embedding reductions (PCA 2D/3D, cluster IDs)
- reasoning embeddings (from `patch_description` + `thought`) and their reductions (PCA 2D, cluster IDs)
- archive membership
- migration history and island assignment
- `system_prompt_id`
- post-evaluation review priority levels and supporting data
- arbitrary runtime metadata for UI/debugging

Main tables:

- `programs`
- `archive`
- `metadata_store`

Additional tables managed by the runner and interaction layer:

- `review_priority_metrics` — cached per-program prioritization signals (score change, code dissimilarity, reasoning dissimilarity) for instant mode switching
- `interactive_commands` — command queue for interactive steering
- `interactive_status` — key-value store for run state, review-prioritization settings, and other runtime config
- `banned_programs` — set of program IDs excluded from parent/inspiration selection (managed by `InteractiveDatabase`)

### Async DB wrapper

`ShinkaEvolve/shinka/database/async_dbase.py`

`AsyncProgramDatabase` wraps the synchronous DB with:

- executor-backed calls
- deadlock debugging
- async sampling and insertion
- background embedding recomputation hooks

### Prompt archive DB

`ShinkaEvolve/shinka/database/prompt_dbase.py`

Prompt co-evolution uses a separate SQLite database:

- `system_prompts`
- `prompt_archive`
- `prompt_metadata_store`

Prompt fitness is updated from the percentile rank of programs generated under each prompt, not just raw score.

## Search and Diversity Logic

### Parent selection

`ShinkaEvolve/shinka/database/parents.py`

Implemented strategies now include:

- `power_law`
- `weighted`
- `beam_search`
- best-of-N style helpers used inside the selectors

These strategies are no longer just paper concepts; they are explicit pluggable classes wired through `ProgramDatabase.sample`.

### Inspirations and context assembly

`ShinkaEvolve/shinka/database/inspirations.py`

The parent does not mutate in isolation. Shinka builds context from:

- archive inspirations
- top-k inspirations
- ordering logic in `InspirationContextBuilder`

That context feeds directly into prompt construction and crossover-style edits.

### Islands and migration

`ShinkaEvolve/shinka/database/islands.py`
`ShinkaEvolve/shinka/database/island_sampler.py`

The island subsystem now includes:

- multiple island assignment/migration strategies
- island selection strategies: `uniform`, `equal`, `proportional`, `weighted`
- dynamic island spawning on stagnation

This makes the database layer responsible not just for storage, but for active exploration scheduling.

## Prompting and Mutation Pipeline

### Program prompt construction

`ShinkaEvolve/shinka/core/sampler.py`

`PromptSampler` now supports:

- `diff`, `full`, `cross`, and `fix` prompt paths
- sorted inspiration context
- text-feedback inclusion
- meta recommendations
- human expert guidance injected by the interactive loop

### Patch types (mutation strategies)

There are four patch types that determine how the LLM modifies a program. They are sampled probabilistically per generation (configured via `patch_types` + `patch_type_probs` in `EvolutionConfig`). A fifth type (`init`) is used only for generation-0 seed programs.

**Prompt files:** `ShinkaEvolve/shinka/prompts/prompts_diff.py`, `prompts_full.py`, `prompts_cross.py`, `prompts_fix.py`, `prompts_init.py`

Every patch type requires the LLM to produce structured XML tags in its response: `<NAME>` (a short identifier), `<DESCRIPTION>` (reasoning and argumentation), and either `<CODE>` (full rewrite types) or `<DIFF>` (diff type). These are extracted after generation and stored in program metadata as `patch_name` and `patch_description`.

#### `diff` — Targeted edit

- Produces SEARCH/REPLACE blocks (surgical patches applied sequentially)
- Description prompt: "A description and argumentation process of the edit you are proposing"
- Use case: small, focused changes — tweak a loop, swap a data structure, adjust a threshold

#### `full` — Complete rewrite

- Produces the entire program in a `<CODE>` block
- Has **5 sub-variants**, one of which is randomly selected each time via `np.random.randint`:

| Index | Name | System prompt instruction | `<DESCRIPTION>` asks for |
| --- | --- | --- | --- |
| 0 | `default` | "Rewrite the program to improve its performance" | "A description and argumentation process of the code" |
| 1 | `different_algorithm` | "Design a completely different algorithm approach... ignore the current implementation" | "Explain the completely different algorithmic approach and why it should perform better" |
| 2 | `context_motivated` | "Create a novel algorithm that draws inspiration from the provided context programs but implements a fundamentally different approach" | "Explain how you drew inspiration from the context programs and what novel approach you are implementing" |
| 3 | `structural_redesign` | "Redesign the program with a different structural approach while potentially using similar core concepts" | "Describe the structural changes and how they improve performance, maintainability, or efficiency" |
| 4 | `parametric_design` | "Analyze the current program to identify its key parameters... design a new algorithm with different parameter settings" | "Identify the key parameters and explain how your new parameter choices will lead to better performance" |

**Note:** The sub-variant index is not currently stored in program metadata — only `patch_type: "full"` is recorded. There is no way to determine which sub-variant was used from the database alone.

#### `cross` — Crossover

- Produces a full rewrite, but with a randomly sampled "inspiration program" appended to the prompt
- Instruction: "Perform a cross-over between the code script above and the one below. Aim to combine the best parts of both"
- Description prompt: "A description and argumentation process of the code you are proposing"
- Use case: combines two programs' approaches (analogous to genetic crossover)

#### `fix` — Error repair

- Produces a full rewrite given error logs (stdout/stderr from the failed evaluation)
- Instruction: "Analyze the error output and fix the program"
- Description prompt: "Describe the bug you identified and the fix you are applying. Include your analysis of the error messages"
- Not sampled randomly — triggered via `PromptSampler.sample_fix()` when no correct parent exists in the population
- Use case: repair a broken program using its evaluation error output

#### `init` — Initial program (generation 0)

- Produces the seed program for a run
- Not sampled — only used once at the start
- Description prompt: "A description of the initial code you are proposing"

### LLM response storage

The full LLM response is serialized via `QueryResult.to_dict()` and stored in program metadata as `metadata.llm_result`. This includes:

- `content`: the generated patch or code
- `thought`: the LLM's chain-of-thought reasoning (available when using thinking models, e.g. Gemini with `getattr(part, "thought", False)`)
- `msg` / `system_msg`: the prompts sent to the model
- `new_msg_history`: full conversation history
- `model_name`, token counts, costs, and generation parameters

Additional structured fields stored directly in metadata: `patch_name`, `patch_description`, `diff_summary`, `patch_type`, `api_costs`, `num_applied`, and various attempt counters.

### Prompt co-evolution

`ShinkaEvolve/shinka/core/prompt_evolver.py`, `ShinkaEvolve/shinka/prompts/prompts_prompt_evo.py`

The system prompt itself (`task_sys_msg`) can evolve alongside programs. This is a meta-meta level: the prompt evolver mutates the instructions given to the code-generation LLM, using top-performing programs as evidence for what the prompt should encourage. It has its own `diff` and `full` strategies and writes variants into `prompts.sqlite`.

### Patch application

`ShinkaEvolve/shinka/edit/`

Main responsibilities:

- apply diff patches
- apply full rewrites
- redact immutable code regions
- summarize applied diffs
- provide async file-edit utilities
- extract reasoning text from LLM metadata (`extract_reasoning_text`) and compute reasoning embeddings (`get_reasoning_embedding_async`)

### Fix mode

`PromptSampler.sample_fix`, `ProgramDatabase.sample_with_fix_mode`

This is a significant runtime behavior change. When the current population has no correct program, the system can switch into "fix mode" and try to repair an incorrect ancestor rather than continue normal improvement-style mutation.

## LLM and Embedding Service Layer

### LLM routing and provider resolution

`ShinkaEvolve/shinka/llm/client.py`
`ShinkaEvolve/shinka/llm/providers/`

The LLM stack is now provider-based. It resolves model backends and supports:

- OpenAI
- Azure OpenAI
- Anthropic
- Bedrock Anthropic
- Gemini
- DeepSeek
- OpenRouter
- local OpenAI-compatible servers

### Bandit-based model selection

`ShinkaEvolve/shinka/llm/prioritization.py`

Current strategies include:

- `FixedSampler`
- `AsymmetricUCB`
- `ThompsonSampler`

The bandit state is persisted to `bandit_state.pkl` for resume support.

### Embeddings

`ShinkaEvolve/shinka/embed/client.py`
`ShinkaEvolve/shinka/embed/embedding.py`

Embedding services are now a parallel subsystem rather than an LLM afterthought. Two embedding types are computed:

- **Code embeddings**: generated from the program source code. Used for novelty rejection, nearest-neighbor lookup, PCA projections, clustering, and visualization.
- **Reasoning embeddings**: generated from the LLM's reasoning metadata — specifically the concatenation of `patch_description` and `thought` (from `metadata.llm_result.thought`). Filtered independently by `extract_reasoning_text()` in `ShinkaEvolve/shinka/reasoning.py` and embedded with the same embedding model. These capture the *intent* behind a mutation rather than the resulting code, enabling diversity-aware search in the reasoning space.

Both embedding types share the same model (configured via `embedding_model`) and support independent PCA 2D projections and GMM clustering. The frontend can toggle between code and reasoning embeddings via the `embeddingSource` setting, which switches all visualization components (scatter plots, similarity heatmaps, chord links, merge partner recommendations) to use the selected embedding type.

## Evaluation Layer

### Job execution

`ShinkaEvolve/shinka/launch/scheduler.py`

`JobScheduler` abstracts three execution backends:

- local processes
- Slurm with Docker
- Slurm with Conda

### Evaluation harness

`ShinkaEvolve/shinka/core/wrap_eval.py`

The evaluator contract is still "generated program plus evaluation script", but the wrapper now also supports:

- repeated runs
- deterministic result ordering
- optional process-level parallelism inside evaluation
- NaN/Inf guards
- early stopping modes
- plot artifact generation

## Meta Reasoning, Novelty Rejection, and Review Prioritization

### Meta summarization

`ShinkaEvolve/shinka/core/summarizer.py`
`ShinkaEvolve/shinka/core/async_summarizer.py`

The meta subsystem still follows the same three conceptual stages:

1. summarize newly evaluated programs
2. synthesize global insights
3. produce actionable recommendations

The runner writes `meta_<n>.txt` artifacts that the UIs can display and export.
The runner checkpoints the summarizer to `meta/state.json` and restores it before proposal generation.
The checkpoint includes pending program records, the processed-program count, summaries, recommendations, scratchpad, and recommendation history.
Reported meta costs are stored in program metadata in SQLite and restored from there when the runner starts.
Checkpoint writes are atomic and serialized with meta updates; malformed checkpoints fail validation before any state is replaced.
A run without an explicit checkpoint starts with empty meta state, while existing display summaries remain on disk; text summaries are not treated as recoverable checkpoint data.

### Reasoning embedding validity and derived data

`shinka/reasoning.py` filters `patch_description` and `llm_result.thought` independently, rejecting exact placeholders and absent/non-string/punctuation-only fields before joining eligible text and applying the 10,000-character limit.
Normal proposals, Suggest, Merge, and initialization share this policy; file-based seed boilerplate receives no embedding, while an explicit strategy or valid thought remains eligible.
Provider results must be finite nonzero numeric vectors, and an invalid result retains its reported API cost.
Program boundaries, thread-safe JSON readers, metadata updates, and direct SQL island copies/migrations normalize invalid reasoning vectors to `[]`, their PCA coordinates to `[]`, and their cluster to `null`.
Metadata and reasoning normalization are written atomically.

`shinka/reasoning_features.py` computes reasoning features locally using stable program-ID order, StandardScaler → PCA with two dimensions and the full SVD solver, and four-component full-vector GMM clustering with seed `42`.
Fewer than four distinct usable vectors leave derived fields absent, and refreshes clear stale excluded fields.
Reasoning refresh runs independently of code vectors and provider credentials.
See [Reasoning embeddings](reasoning-embeddings.md) for the complete validity rules and release-copy workflow.

### Pre-evaluation novelty rejection

`ShinkaEvolve/shinka/core/novelty_judge.py`
`ShinkaEvolve/shinka/core/async_novelty_judge.py`

This rejects near-duplicate proposals before evaluation using:

- **Code embedding similarity**: cosine similarity against existing island members, controlled by `code_embed_sim_threshold`
- **Reasoning embedding similarity** (optional): cosine similarity of reasoning embeddings, controlled by `reasoning_embed_sim_threshold`. Enabled via `use_reasoning_novelty=True` in `EvolutionConfig`. When enabled, rejection uses `max(code_similarity, reasoning_similarity)` — a program is rejected if *either* dimension is too similar to an existing program.
- **Optional LLM novelty review**: a secondary check using a cheap LLM to assess borderline cases

Unusable reasoning vectors and incompatible dimensions are skipped instead of converted to synthetic similarity scores.

### Post-evaluation expert review prioritization

`ShinkaEvolve/shinka/core/review_prioritizer.py`

`ReviewPrioritizer` assigns attention-routing labels after evaluation. It is separate from `NoveltyJudge`: it never rejects a candidate, changes a score, or affects parent selection.

It assigns one of three review priority levels to an accepted, evaluated program:

- `none`
- `moderate`
- `high`

The prioritizer can hot-reload a custom `prioritize_for_review` function from disk. It writes `review_prioritization_error.json` when loading fails so the frontend can expose the problem, then falls back to the default function.

#### Default prioritization modes

When no custom prioritization function is configured, the prioritizer supports two built-in modes:

- **Score change** (`score_change`): Computes the percentage gain between parent and child combined scores. Thresholds (`score_change_moderate`, `score_change_high`) determine the review priority. A score gain is a prioritization signal, not a claim of semantic novelty.
- **Dissimilarity** (`dissimilarity`): Computes the minimum cosine distance between the new program's embedding and all previously generated programs' embeddings. It can use code or reasoning embeddings, controlled by `dissimilarity_embedding`. Thresholds (`dissimilarity_moderate`, `dissimilarity_high`) determine the review priority.

#### Prioritization-signal caching

`ReviewPrioritizer.compute_priority_metrics()` computes all three default metrics (score change, code dissimilarity, reasoning dissimilarity) for every newly evaluated program, regardless of the currently active mode. These are cached in the `review_priority_metrics` table in `programs.sqlite` (via `ProgramDatabase.set_review_priority_metrics()`). This allows instant mode switching in the frontend without recomputing metrics.

The runner's post-evaluation hook (`_compute_and_cache_priority` in `async_runner.py`) creates a thread-local `ProgramDatabase` to avoid SQLite thread-safety issues when called from `run_in_executor`. It fetches all prior embeddings via `get_all_embeddings_before()`, computes metrics, caches them, then applies thresholds via `_apply_review_priority_thresholds()`.

Reasoning cache values are `null` when no usable current vector or compatible predecessor exists.
Historical comparisons use lower generation, or the same generation with earlier timestamp; equal generation/timestamp peers are never ordered by SQL row position.
Offline cleanup updates only this cache component and preserves historical review-priority assignments.

#### Review-priority configuration

Thresholds for the default prioritizer are configurable at runtime from the frontend Settings modal. The complete settings object is stored only at `interactive_status["review_prioritization_settings"]` via `InteractiveDatabase.write_review_prioritization_settings()` and `read_review_prioritization_settings()`. The backend and runner use these same methods. When settings change, the backend recomputes stored review priorities from cached metrics, and newly evaluated programs read the same saved settings without requiring a runner restart.

The structured `review_priority_data` stored on each program includes mode-specific fields:
- Score change mode: `mode`, `reason`, `gain_pct`, `parent_score`, `program_score`
- Dissimilarity mode: `mode`, `reason`, `dissimilarity`, `embedding_source`

## Visualization and Interaction

### Legacy web UI

`ShinkaEvolve/shinka/webui/visualization.py`

This is still present and now exposes more endpoints than the older document captured, including:

- program list/detail views
- database stats
- prompt database inspection
- meta file listing and PDF export

It remains a monolithic Python HTTP server over static HTML.

### Repo-local `evomaestro-interface`

`evomaestro-interface/`

This repo adds a second UI stack that is distinct from upstream `ShinkaEvolve`:

- FastAPI backend in `evomaestro-interface/backend/main.py`
- Next.js frontend in `evomaestro-interface/src/`
- REST endpoints for database browsing, experiment config, meta files (including `meta/` subdirectory), review-priority status and settings, program banning, and interactive control
- `POST /api/callback` endpoint that receives push events from the runner's `EventNotifier`
- WebSocket push updates for:
  - `program.queued` — a program has been submitted for evaluation (shows as a ghost node in the tree)
  - `program.generated` — evaluation complete, full program data available (upgrades ghost to real node)
  - `run.status` — interactive status changes
  - `review_priority.assigned` — post-evaluation review priority assignment
  - `programs.updated` — fallback polling safety net (~30 s)

The primary data flow is now push-based: **Runner → HTTP callback → Backend → WebSocket → Frontend**. SQLite polling serves as a fallback safety net for missed callbacks.

This is the preferred architecture in this repo for live monitoring and expert steering.

**Access control:** Trusted-local mode does not authenticate HTTP or WebSocket clients.
Dataset-role checks reject writes to the fixed guide and Maestro Chat requests for mock datasets.
The explicit anonymous public-demo policy restricts access to the configured mock working copy and fixed guide; trusted-local mode remains available for ordinary experiments.

**Request routing:** Browser HTTP and WebSocket traffic uses the frontend origin through `/api`. Next.js proxies unmatched requests and WebSocket upgrades to the server-only `API_PROXY` target. The launcher binds FastAPI to loopback; there is no browser configuration endpoint exposing its address or a shared token. A production build must be rebuilt if the backend port changes. The planned demo origin is `https://evomaestro-demo.reify.ing`; see [deployment routing](../guides/mock-examples.md#single-origin-demo-routing). Routing alone provides no access control; the `--public-demo` policy separately enforces dataset and endpoint restrictions, authenticates private callbacks, and disables Maestro.

#### Expert steering UI features

The tree visualization and node interaction include several features designed for expert-guided evolution:

- **Score-based filtering:** Right-clicking a correct node offers a "Filter" option that dims all nodes below that node's score (0.15 opacity). "Remove Filter" appears in both node and canvas context menus when a filter is active. The same options appear in the Selected Programs panel.
- **Node banning:** Nodes can be banned via right-click or the Selected Programs panel. Banned nodes are permanently dimmed (0.15 opacity) in the tree view. Ban state is persisted both to localStorage (`evolve-banned-nodes`) and to the backend via `InteractiveDatabase.ban_program()`. On database selection, the frontend hydrates banned IDs from the backend and merges with localStorage. Multi-select supports mixed state: shows "Ban" when any are unbanned, "Unban" when any are banned. **Server-side enforcement:** The runner excludes banned IDs from parent sampling (retry loop up to 20 attempts) and inspiration selection (post-filtering) via `excluded_ids` parameter threaded through `ProgramDatabase.sample()`, `sample_with_fix_mode()`, and `sample_inspirations_for_parent()`. The base runner's `_get_banned_ids()` returns an empty set; the interactive runner overrides it to read from `InteractiveDatabase`. In the frontend, banned nodes have Suggest and Merge actions hidden from both the context menu and the Selected Programs panel.
- **Expert Suggestion modal:** When suggesting a mutation for a node, the modal displays the node's `meta_recommendations` (rendered as markdown) as a reference recommendation, helping experts align their guidance with the meta-summarizer's analysis.
- **Merge partner recommendations:** Eligible partners are ranked by a global quality–diversity balance configured in Settings. Recommendation rows expose the normalized quality, normalized diversity, and combined ranking scores. If the chosen embedding source is unavailable, ranking falls back to normalized program quality.
- **Evolution Overview sidebar:** A floating "Evolution Overview" button in the workspace opens a non-blocking sidebar showing the latest global insights scratchpad (`meta_<n>.txt`, `# GLOBAL INSIGHTS SCRATCHPAD` section) rendered as markdown. The sidebar auto-refreshes when new programs arrive. The button is hidden when no meta files exist for the current database.
- **Dissimilarity analysis:** The similarity analysis modal has been renamed to "Dissimilarity Analysis" for consistency with the dissimilarity chord links. The heatmap displays `1 - cosine_similarity` with a range of 0–2 on a RdBu color scale.

#### Tree visualization settings

User-configurable settings (persisted to localStorage via `evolve-settings`):

- **Color map:** Toggle between Blues (default) and Viridis color scales for node scores in `TreeVisualizationNew` and its legend.
- **Color midpoint:** Toggle between Median (default) and Average. The performance color scale uses this as its midpoint, mapping `[min, midpoint, max]` → `[0, 0.5, 1]` of the interpolator. This gives more color resolution to above-midpoint nodes when scores cluster high.
- **Dissimilarity threshold:** Slider (0–2) controlling the minimum dissimilarity for chord links to be displayed. Replaces the previously hardcoded `0.01` threshold. Higher values show only more dissimilar island pairs.
- **Embedding source:** Toggle between Code and Reasoning embedding spaces. Auto-defaults to Reasoning when usable reasoning embeddings are present in the dataset. Disabled (grayed out) when no reasoning embeddings exist. Switching does not trigger physics re-simulation — only analytics (chord links, similarity) are recomputed.
- **Merge recommendation balance:** Slider from Program Quality to Idea Diversity. It persists `mergeDiversityWeight` globally, derives the complementary quality weight, and reranks an open Merge modal immediately.
- **Other settings:** Show/hide error and timeout nodes, include them in statistics, show crossover links, proportional sectors, and unify mutation types.
  Node-type toggles are auto-disabled when no such nodes exist in the dataset.
  The Tree tab uses `TreeVisualizationNew`; there is no visualization-mode setting.
- **Settings UX:** Setting descriptions use clickable help icons (`?`) instead of hover tooltips.

#### Node shape unification

The `unifyMutationTypes` setting defaults to enabled: `diff` and `full` share the localized Mutation label and circle shape.
When disabled, Diff uses a square and Full rewrite uses a circle, with separate labels.
The legend, tooltips, Details, Programs, and Path → Best use the same setting; the underlying `patch_type` in the database is unchanged.

#### Interactive guided tour

A bilingual guided tour (`GuidedTour.tsx`, `react-joyride`) walks new users through the interface:

- The shared toolbar language switch controls English / Simplified Chinese for both the complete interface and the tour.
- An unnumbered welcome card explains that the guide temporarily uses `mock-guide`; **Start Tour** begins the numbered steps, and every exit restores the previous dataset and view.
- 18 main steps covering all major features (tree view, best nodes, chords, context menu with real node zoom, node and global Maestro Chat, Suggest/Merge detail with screenshots, review-priority indicators, Evolution Overview, multi-select, score distribution, tabs, search, settings, Background & Help resources)
- 5 optional "More Details" steps (Run Control, Legend, cross-island nodes, island root nodes, ring arcs) with zoom-to-element spotlighting
- Async synchronization for zoom animations, context menu rendering, and sidebar slide-in
- Launched via "Guide" button in the toolbar

#### Legend and tree view improvements

- Legend hides node-type labels (Error, Timeout, Human) when no such nodes exist in the dataset
- Tree view uses `display: none` instead of unmounting when switching tabs, preserving zoom/pan state

#### Dynamic island support in tree visualization

The radial tree visualization correctly handles dynamic islands with cross-island migration:

- **Island index resolution** (`treeProcessing.ts`): Each node's own `island_idx` takes priority over the parent's. The parent island is only inherited when the node's own `island_idx` is null. This ensures `getIslandIdxForNodeId()` returns the correct island for migrated nodes.
- **Sector computation** (`treeLayoutEngine.ts`): The effective sector count is derived from distinct `island_idx` values in actual data, not from the number of tree branch roots. This eliminates phantom sectors when multiple root programs share an island. Proportional sector widths use tree depth (hop count from branch root), not `generation`, to match the simulation's ring placement.
- **Simulation** (`treeSimulation.ts`): Nodes are assigned to sectors by their own `island_idx`. Cross-island parent-child gravity is disabled to prevent tug-of-war between sector and parent forces.
- **Analytics** (`treeAnalytics.ts`): Island averages, bests, and local-best paths are computed by grouping all programs by their actual `island_idx`, not by tree descendancy. Island best paths are suppressed when they cross island boundaries. Island chord links anchor at the initial program nodes but compute dissimilarity from per-island best embeddings.
- **Decorations** (`treeDecorations.ts`): Sector dividers are only drawn at occupied sector boundaries.

Key type changes: `islandAvgScoreByBranchRootId` → `islandAvgScoreByIslandIdx` (`Map<number, number>`), `islandBestProgramByNodeId` → `islandBestProgramByIslandIdx` (`Map<number, ProcessedProgram>`), `islandFilterBranchRootId` → `islandFilterIslandIdx` (`number | null`).

### Read-only release browsing

`InteractiveDatabase(read_only=True)` opens existing databases without enabling WAL or creating control tables.
Read-only status, heartbeat, settings, command-history, and ban queries return absent/empty state when a completed run has no corresponding table.
The backend uses this mode for GET endpoints and WebSocket polling; write commands retain the runtime database initialization path.
This keeps release snapshots byte-for-byte unchanged during browsing.

### SQLite-based interactive control plane

`ShinkaEvolve/shinka/interactive/interactive_db.py`
`ShinkaEvolve/shinka/interactive/web_controller.py`
`ShinkaEvolve/shinka/interactive/payload_schemas.py`

The interaction model is not direct RPC from UI to runner. It is SQLite-backed IPC:

- UI/backend writes commands into `interactive_commands`
- runner polls and executes them
- runner writes current status into `interactive_status`
- UI reads status and recent command results
- `banned_programs` table stores server-side ban state, read by the runner at sampling time

Command payloads are validated with Pydantic schemas in `payload_schemas.py`, ensuring type safety for structured commands like `suggest` (with `patch_type` and `suggestion` fields) and `merge` (with `parent_ids` list).

Supported commands include:

- `start`
- `pause`
- `resume`
- `step`
- `stop`
- `set_target`
- `suggest`
- `merge`

The visible **Continue** button queues `resume` for a paused run; it does not use a separate command.
This design keeps the runner and UI loosely coupled and resilient to process restarts.

### Maestro-assisted analysis overlays

`evomaestro-interface/src/app/api/codex/*`
`evomaestro-interface/src/components/chat/ChatPanel.tsx`
`evomaestro-interface/src/lib/codex-threads.ts`

This is another repo-local addition, not core upstream ShinkaEvolve.

The shell can open a Maestro chat scoped to:

- a single program
- a parent/child mutation
- a two-program comparison

The chat routes use the run's `results_dir` as the Maestro working directory so the agent can inspect the actual generated code files. The system prompt includes a fallback note instructing Maestro to query `programs.sqlite` when `gen_<n>/` folders are missing from disk (which happens when results are partially copied or proposals fail without cleanup). All `startThread` and `resumeThread` calls use `sandboxMode: "danger-full-access"` to bypass bubblewrap sandboxing, which fails in Linux containers without `CAP_SYS_ADMIN`.

**Per-user cache isolation:** Thread-to-program-pair mappings are stored in `.codex-threads.json`. This file is scoped per `resultsDir` — when a `resultsDir` is provided, the cache file lives at `<resultsDir>/.codex-threads.json` instead of the shared `evomaestro-interface/` directory. This isolates chat history across concurrent user-study participants. Session JSONL files (managed by the Codex SDK) remain in `~/.codex/sessions/` and are keyed by thread ID so they don't conflict.

## Artifacts Produced by a Run

A typical results directory now contains some mix of:

- `programs.sqlite`
- `prompts.sqlite`
- `experiment_config.yaml`
- `bandit_state.pkl`
- `meta_<n>.txt` (also in `meta/` subdirectory)
- `meta/state.json` (validated runner checkpoint for meta resume)
- `review_prioritization_error.json`
- `.codex-threads.json` (per-user Maestro chat thread cache)
- `gen_<n>/main.<ext>`
- `gen_<n>/results/...`
- logs and optional plots

This artifact set is important because both UIs and resume behavior depend on it.

## Migration Tools

`ShinkaEvolve/shinka/tools/compat/`

Standalone CLI tools for migrating and backfilling existing databases:

- **`migrate_review_prioritization.py`**: Performs the one-way breaking rename from post-evaluation `novelty_*` schema names to the canonical review-prioritization schema. It supports `--dry-run`, creates a numbered SQLite backup before mutation, records the schema version, and rejects mixed legacy/canonical schemas.
- **`backfill_review_priorities.py`**: Populates cached score-change and embedding-dissimilarity signals for every canonical-schema program, then runs the default review prioritizer on programs that lack a priority. Existing non-`none` assignments are preserved unless `--force` is used. Use `--metrics-only` to rebuild all three cached signals without changing any program field, including `none` priorities and custom assignment data; this mode cannot be combined with `--force`. Both embedding comparisons exclude peers sharing a generation and timestamp. Its `--dry-run` opens an existing database read-only, and writes run atomically after the CLI creates a numbered SQLite backup.
- **`repair_reasoning_embeddings.py`**: Audits through a read-only SQLite connection with `--dry-run`, or creates a separate validated cleanup-only snapshot with `--output`. Uses SQLite backup to include committed WAL data, clears invalid vectors, refreshes affected reasoning features and cached distances, and preserves all unrelated values and retained vector payloads. No provider is instantiated. JSON reports contain reason codes, IDs, hashes, algorithm settings, and validation evidence.
- **`backfill_reasoning_embeddings.py`**: Generates missing eligible reasoning vectors using the embedding API after validating existing data. Its dry-run is read-only and its backup includes WAL data. Runtime and backfill share the local PCA/GMM and historical reasoning-distance routines. Supports `--dry-run`, `--force`, `--model`, and `--batch-size`; release cleanup uses the offline repair command instead.

Database-mutating compatibility tools create numbered backups before modification.

## Practical Reading Order for the Codebase

For understanding current behavior, the shortest useful reading order is:

1. `ShinkaEvolve/shinka/core/config.py`
2. `ShinkaEvolve/shinka/core/async_runner.py`
3. `ShinkaEvolve/shinka/core/async_interactive_runner.py`
4. `ShinkaEvolve/shinka/database/dbase.py`
5. `ShinkaEvolve/shinka/core/sampler.py`
6. `ShinkaEvolve/shinka/core/prompt_evolver.py`
7. `ShinkaEvolve/shinka/interactive/interactive_db.py`
8. `evomaestro-interface/backend/main.py`
9. `evomaestro-interface/architecture.md`

## User-Study Deployment

### Data isolation

The local study launch tasks use existing per-participant copies of the experiment data:

```
user-study-data/
  MOP/
    01/   ← full copy of MOP/ for user 01
    02/   ← full copy of MOP/ for user 02
    ...
  GraphMOP/
    01/
    02/
    ...
```

Each copy has its own `results_50g_runs/`, runner script, and evaluation code. The Maestro thread cache (`.codex-threads.json`) is scoped per `resultsDir`, so chat histories don't collide across participants.
The legacy preparation script and internal meeting notes have been removed from the source tree; existing study data stays outside the source release.

### Runner scripts

`datasets/MOP/run_evo_explicit_50g.py` and `datasets/GraphMOP/run_evo_explicit_50g.py` support:

- `--interactive`: use `ShinkaEvolveInteractiveRunner` with keep-alive and steering
- `--resume DIR`: resume from an existing results directory instead of creating a fresh timestamped one. The interactive runner auto-detects the existing database and starts paused for review.
- `load_dotenv()` searches the runner directory and its parents, so the repository-root `.env` remains discoverable beneath `datasets/`.
- `find_venv_activate(start_dir)`: walks up parent directories to find the closest `.venv/bin/activate`, so the script works regardless of its directory depth (original `datasets/MOP/` or copied `user-study-data/MOP/01/`).

### Multi-instance poe tasks

`pyproject.toml` defines parameterized tasks for launching per-user instances:

- `start-interactive-mop N`: local development on ports 41xx/42xx.
- `start-interactive-graph-mop N`: local development on ports 151xx/152xx.

The published study tasks and legacy OXC launch tasks have been removed.

Each task passes `--runner-args '--resume ...'` to resume from the pre-seeded database. The launcher sets `API_PROXY` and `EVOLVE_SHELL_URL` to its loopback backend for frontend proxying and local runner callbacks; browsers use same-origin HTTP and WebSocket routes. These optional study tasks require private participant directories and are separate from the public mock-demo launcher.

## Current Architectural Ground Truth

The most important thing to keep in mind is that "ShinkaEvolve architecture" is no longer a single queue-based runner plus a static visualization page.

The current ground truth is:

- a **two-tier runner** (`ShinkaEvolveRunner` base + `ShinkaEvolveInteractiveRunner` subclass) rather than three separate runtimes
- a **SQLite-centered control and state model**
- a **separate prompt-evolution subsystem**
- a **pre-evaluation novelty-rejection pipeline** and a separate **post-evaluation expert-review-prioritization pipeline** with cached signals and runtime-configurable thresholds
- a **provider-based model service layer**
- a **repo-local interactive shell** that sits alongside upstream ShinkaEvolve rather than replacing it
- a **dynamic-island-aware tree visualization** that correctly handles cross-island migration
- an **expert steering toolkit** with score filtering, server-enforced node banning, meta-recommendation-assisted suggestions, and a global insights overview sidebar
- an **interactive guided tour** with bilingual support, real UI demonstrations, and zoom-to-element spotlighting
- a **per-user-isolated deployment model** for concurrent user studies with independent data, Maestro caches, and runner instances

## Recent Additions (April 2026)

### Bandit state arm remapping

`ShinkaEvolve/shinka/llm/prioritization.py`

The bandit state serialization (`get_state` / `set_state`) now saves `arm_names` in the pickled state. When the model list changes between saves (models added, removed, or reordered), `set_state` remaps per-arm arrays by name — preserving learned statistics for unchanged models, zeroing stats for new ones, and dropping removed ones. Legacy state files without `arm_names` are detected and deleted on load (`_load_bandit_state` in `async_runner.py`), forcing a clean restart.

### Interactive proposal logging

`ShinkaEvolve/shinka/core/async_interactive_runner.py`

The `_generate_interactive_proposal_async` method now logs 8 numbered stages (directory setup, meta recommendations, model selection, LLM call with timing, patch result, embedding, evaluation submission, frontend notification) so delays in the suggest/merge pipeline can be traced precisely.

### httpx log suppression

`ShinkaEvolve/shinka/core/async_runner.py`

The runner's logging setup suppresses `httpx` INFO logs (HTTP request/response lines from the embedding and LLM clients) to reduce console noise during evolution runs.

### Maestro chat and code annotations

`evomaestro-interface/src/app/api/codex/*`, `evomaestro-interface/src/components/chat/`, `evomaestro-interface/src/lib/codeNotes.ts`

The Maestro chat system has been significantly enhanced:

- **Global Maestro Chat**: An experiment-scoped chat sidebar accessible from the tree view. The system prompt includes the full results directory structure (programs.sqlite schema, gen_N/ folder contents, meta_N.txt files, experiment_config.yaml) so the agent has situational awareness of the evolution process.
- **Collapsible thinking/command trace**: Streaming responses show intermediate reasoning and command executions in collapsible sections. The final answer is separated from the thinking process.
- **Code annotations**: Maestro can annotate specific code lines using ` ```note{startLine:endLine} ` blocks. The frontend renders these as clickable amber-bordered cards in the chat that scroll the Monaco editor to the annotated lines with a highlight bar and glyph margin icon. For diff views, `left`/`right` prefixes target the original or modified editor pane.
- **Session history**: The JSONL session parser (`codex-threads.ts`) extracts function_call/function_call_output pairs and groups intermediate assistant messages as thinking items per turn, so cached conversations display with the same collapsible structure.
- **Error recovery**: On Codex errors, the frontend discards its local thread ID and resolves the saved server-side conversation on the next message. Clear conversation explicitly resets that saved binding and cancels active work. Stream-level errors, including usage limits, are forwarded to the client.
- **Quick-action buttons**: Suggestion buttons ("Explain the code", "Explain the differences", "What's the overall status") appear above the input and auto-send on click.

### Toast notifications

`evomaestro-interface/src/components/Toast.tsx`

A lightweight toast system shows success/error notifications at the bottom-right corner with auto-dismiss after 4 seconds. Used for suggest/merge submission feedback.

### Score change indicator

`evomaestro-interface/src/components/tree/treeRenderer.ts`

When a node is selected, the last link segment (between the node and its parent) shows a half-solid/half-dashed pattern indicating score change direction:
- Child improved: parent-side dashed, child-side solid
- Parent was better: parent-side solid, child-side dashed
- Equal scores: fully solid (no overlay)

Controlled by the "Score Change Indicator" toggle in Settings.

### Unify Mutation Types toggle

The "diff" and "full" patch types can now be toggled between unified ("mutation" with circle shape) and split (diff as square, full as circle) via a Settings toggle. Affects tree node shapes, legend, tooltips, ProgramsTable, and NodeDetailsModal.

### Error node help button

`evomaestro-interface/src/components/modals/NodeDetailsModal.tsx`

Error and timeout nodes display a circled `?` icon next to the score. Clicking it switches to the Evaluation tab and highlights STDOUT/STDERR with the same flash animation used for review-priority indicators.

### Max generation filter

`evomaestro-interface/src/components/Controls.tsx`

A filter button next to the settings icon opens a popup to set a max generation number. Only nodes up to that generation appear in the tree view. Other views (Programs Table, Clusters, Best Path) are unaffected. Useful for focusing on early evolution phases in large runs.

### Server-side program banning (Issue #5)

`ShinkaEvolve/shinka/interactive/interactive_db.py`, `ShinkaEvolve/shinka/database/dbase.py`, `ShinkaEvolve/shinka/core/async_runner.py`, `ShinkaEvolve/shinka/core/async_interactive_runner.py`

Program banning is now enforced at the runner level, not just the UI:

- **Storage:** `InteractiveDatabase` manages a `banned_programs` table with `ban_program()`, `unban_program()`, and `get_banned_ids()`.
- **Enforcement:** `ProgramDatabase.sample()`, `sample_with_fix_mode()`, and `sample_inspirations_for_parent()` accept an `excluded_ids` parameter. Parent sampling retries up to 20 times when a banned parent is drawn. Inspiration selection post-filters banned IDs.
- **Runner integration:** `ShinkaEvolveRunner._get_banned_ids()` returns an empty set (base). `ShinkaEvolveInteractiveRunner` overrides it to read from the interactive DB. The excluded set is passed into all sampling calls.
- **Async threading:** `AsyncProgramDatabase` threads `excluded_ids` through `sample_async()`, `sample_with_fix_mode_async()`, and `sample_inspirations_for_parent_async()`.
- **Frontend:** Banned nodes have Suggest and Merge actions hidden from both the context menu (`NodeContextMenu.tsx`) and the Selected Programs panel (`SelectedProgramsPanel.tsx`). The merge modal (`NodeMergeModal.tsx`) excludes banned nodes from partner recommendations. Ban state is synced to the backend via fire-and-forget API calls and hydrated from the backend on database selection.
- **API:** `POST /api/run/ban`, `POST /api/run/unban`, `GET /api/run/banned` endpoints in `evomaestro-interface/backend/main.py`.
- **Legacy migration:** `_ensure_tables()` uses `CREATE TABLE IF NOT EXISTS`, so existing databases without the `banned_programs` table are upgraded transparently on first access.

### Multi-signal expert review prioritization with caching (Issue #6)

`ShinkaEvolve/shinka/core/review_prioritizer.py`, `ShinkaEvolve/shinka/database/dbase.py`, `ShinkaEvolve/shinka/core/async_runner.py`, `evomaestro-interface/backend/main.py`, `evomaestro-interface/src/components/modals/SettingsModal.tsx`

The default review-prioritization system computes and caches all supported signals up front, enabling instant mode switching:

- **Metrics computed per program:** score change (parent→child percentage gain), code embedding dissimilarity (min cosine distance to all prior programs), reasoning embedding dissimilarity (same, using reasoning embeddings).
- **Caching:** `ProgramDatabase` manages a `review_priority_metrics` table with `set_review_priority_metrics()`, `get_review_priority_metrics()`, and `get_all_review_priority_metrics()`. All three metrics are stored after each evaluation.
- **Embedding retrieval:** `get_all_embeddings_before(program_id)` returns all code and reasoning embeddings for programs created before the given program, supporting the dissimilarity computation.
- **Thread safety:** The runner's post-eval hook creates a thread-local `ProgramDatabase` inside `run_in_executor` to avoid SQLite connection sharing across threads.
- **Threshold application:** `_apply_review_priority_thresholds()` (static method on `ShinkaEvolveRunner`) reads the active mode and thresholds, selects the appropriate cached metric, and produces a structured `review_priority_data` dict with mode-specific fields.
- **Settings persistence:** Review-prioritization settings (mode, thresholds, embedding source) are stored only at `interactive_status["review_prioritization_settings"]` via `InteractiveDatabase.write_review_prioritization_settings()` and `read_review_prioritization_settings()`.
- **Frontend settings:** The Settings modal (`SettingsModal.tsx`) shows mode selection (Score Change / Dissimilarity), per-mode threshold inputs, and an Apply button. For custom prioritization functions, the section shows "Customized" and disables editing.
- **Backend recompute:** `POST /api/run/review_prioritization_settings` saves new settings, reads all cached metrics joined with parent scores, applies thresholds, and batch-updates program review-priority levels and data without re-embedding.
- **Display:** `EvaluationView.tsx` renders mode-specific detail rows: Gain %, Parent Score, Program Score for `score_change`; Min Dissimilarity and Embedding Source for `dissimilarity`. Custom prioritization functions display their supporting JSON.

### Tour overlay reliability

`evomaestro-interface/src/components/views/TreeVisualizationNew.tsx`

Tour overlay positioning for focus steps (crossover, island root, ring arc) now re-tags target SVG elements in the zoom `end` callback via a `retag` function, fixing cases where D3 data joins recreated elements during zoom transitions and lost the `data-tour-focus` attribute.

## Resume and completion behavior

### Meta checkpoints

The runner restores a validated `meta/state.json` before sampling proposals and writes checkpoints after meta-state changes and during cleanup.
Missing checkpoints retain the empty-state behavior for older runs; malformed checkpoints stop restoration without overwriting the original file.
Restoration uses the last successfully saved checkpoint; it does not reconcile programs persisted immediately before a hard interruption between the database write and checkpoint write.
Reported costs are retained even when a response has no usable content.
An incomplete program-summary batch stays pending for the existing scheduler to retry, which can regenerate summaries for candidates that already succeeded in that batch.

### Completed generations

Completed work is the number of distinct persisted generation IDs, including the initial generation.
Island migration and dynamic spawning copy an existing generation and therefore do not inflate completion counts.
Already persisted work is not subtracted merely because its generation still appears in running or retry bookkeeping.

## Related Documents

- **Repo-local shell architecture**: [`../../evomaestro-interface/architecture.md`](../../evomaestro-interface/architecture.md)
- **Upstream paper summary**: [`../reference-papers/shinka-evolve/shinka_evolve.md`](../reference-papers/shinka-evolve/shinka_evolve.md)
- **AlphaEvolve paper summary**: [`../reference-papers/alpha-evolve/AlphaEvolve.md`](../reference-papers/alpha-evolve/AlphaEvolve.md)
