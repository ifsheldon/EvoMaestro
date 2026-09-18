# EvoMaestro Interface Architecture

## Overview

EvoMaestro Interface is a modern interactive frontend and backend for ShinkaEvolve. It replaces the legacy `shinka/webui` with a Next.js + FastAPI stack supporting real-time push updates, expert-guided evolution steering, and Maestro-assisted code analysis. It serves as the primary interface for live monitoring, interactive control, and user studies.

## Tech Stack

| Layer       | Choice                               | Notes                                                     |
| ----------- | ------------------------------------ | --------------------------------------------------------- |
| Frontend    | Next.js 16 + React 19               | `"use client"` components, Tailwind CSS styling           |
| Charts      | D3.js (tree, heatmaps) + Plotly.js (performance, clusters) | Mixed rendering for different viz needs  |
| Syntax      | highlight.js + marked                | Code display and markdown rendering                       |
| Backend     | FastAPI (Python)                     | `backend/main.py`, imports `shinka.database.ProgramDatabase` directly |
| Database    | SQLite                              | Read-only browsing; writable interactive control and evolution use `programs.sqlite` |
| AI Chat     | OpenAI Codex SDK                     | Scoped chat threads for code analysis                     |
| Package Mgr | Bun (frontend) + uv (backend)       | `start.py` orchestrates both processes                    |
| Formatter   | Biome                                | `biome.json` for consistent code style                    |

## Dependency Workspace

The repository-root `package.json` declares `evomaestro-interface` and `project-page` as Bun workspace members.
The root `bun.lock` records the shared JavaScript dependency graph, and `bunfig.toml` selects hoisted installation into the root `node_modules/`.
When the two applications require different versions, Bun retains those packages in the relevant member’s `node_modules/`.
The interface keeps its application dependencies and scripts in its own `package.json`; the root package owns the Bun version, runtime requirements, trusted dependency scripts, and Husky setup.
Install from the repository root with `bun install --frozen-lockfile`, then run frontend commands from `evomaestro-interface/`.

The Python workspace contains the root project, ShinkaEvolve, and the interface backend, with versions recorded in the root `uv.lock`.
Install with `uv sync --locked --all-packages` and execute Python or Poe commands with `uv run --locked --all-packages` so FastAPI and Uvicorn remain available to launchers and their subprocesses.
Root commands without `--all-packages` select only the root project's dependencies; sharing a lockfile does not select the interface automatically.

## Directory Structure

```
evomaestro-interface/
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Main orchestrator: DB selection, controller, sidebar
│   │   └── api/
│   │       └── codex/                # Maestro chat API routes (start, chat, history, reset)
│   ├── components/
│   │   ├── Controls.tsx              # Task/database selector, toolbar buttons, Guide tour launcher
│   │   ├── GuidedTour.tsx            # Guided-tour steps and navigation controller
│   │   ├── guided-tour/
│   │   │   └── language.tsx          # Bilingual tour content driven by the shared UI locale
│   │   ├── WorkspacePanel.tsx        # Tab container (Tree, Programs, Clusters, Path→Best) + Evolution Overview
│   │   ├── SelectedProgramsPanel.tsx # Multi-select floating panel (view, compare, modify, ban)
│   │   ├── RunPanel.tsx              # Interactive run control (pause/resume/step/stop/suggest/merge)
│   │   ├── OverviewSidebar.tsx       # Non-blocking sidebar showing latest global insights
│   │   ├── NotificationCenter.tsx    # Review-priority notification sidebar
│   │   ├── ReviewPriorityBanner.tsx  # Top-of-page review-priority alert
│   │   ├── ProgramChips.tsx          # Reusable node ID badge chips
│   │   ├── NodeID.tsx                # Truncated node ID display
│   │   ├── context-menu/
│   │   │   ├── NodeContextMenu.tsx   # Right-click menu for nodes
│   │   │   └── CanvasContextMenu.tsx # Right-click menu for empty canvas
│   │   ├── modals/
│   │   │   ├── NodeDetailsModal.tsx  # Draggable node details (score, description, metadata)
│   │   │   ├── SuggestModal.tsx      # Expert suggestion with meta recommendation reference
│   │   │   ├── NodeMergeModal.tsx    # Merge program selection
│   │   │   ├── DiffModalNew.tsx      # Side-by-side code diff with Maestro chat
│   │   │   ├── CodeModal.tsx         # Code viewer with Maestro chat
│   │   │   ├── SettingsModal.tsx     # User preferences (nodes, stats, layout, embeddings, color map)
│   │   │   ├── DistributionModal.tsx # Interactive KDE histogram with score threshold
│   │   │   ├── ComparePerformanceModal.tsx # Multi-program performance comparison
│   │   │   ├── SimilarityAnalysisModal.tsx # Dissimilarity heatmap + PCA scatter
│   │   │   ├── NodeSearchModal.tsx   # Quick node search by number or ID
│   │   │   ├── NoteInputModal.tsx    # Node annotation editor
│   │   │   └── ResumeHintModal.tsx   # Resume mode guidance
│   │   ├── chat/
│   │   │   └── ChatPanel.tsx         # Maestro chat panel (code_view, code_change, code_diff modes)
│   │   ├── tree/                     # Radial tree visualization engine
│   │   │   ├── treeProcessing.ts     # Data preprocessing, ghost nodes, island resolution
│   │   │   ├── treeLayoutEngine.ts   # D3 hierarchy + sector computation
│   │   │   ├── treeSimulation.ts     # Force-directed positioning within sectors
│   │   │   ├── treeAnalytics.ts      # Scores, best paths, chord links, cross links
│   │   │   ├── treeRenderer.ts       # D3 rendering, opacity (filter/ban), visual state
│   │   │   ├── treeNodeRenderer.ts   # Node shapes, labels, colors, bookmarks
│   │   │   ├── treeInteractions.ts   # Click, double-click, hover, context menu handlers
│   │   │   ├── treeDecorations.ts    # Sector dividers, best-path highlights
│   │   │   ├── treeConstants.ts      # Layout constants, LayoutSettings type
│   │   │   ├── treeTypes.ts          # Shared layout and rendering types
│   │   │   ├── TreeLegend.tsx        # Draggable legend panel
│   │   │   └── PatchShapeIcon.tsx    # SVG glyph for patch types
│   │   ├── views/
│   │   │   ├── TreeVisualizationNew.tsx  # Radial tree (force-directed)
│   │   │   ├── ProgramsTable.tsx     # Sortable program table
│   │   │   ├── ClustersView.tsx      # PCA + GMM cluster scatter plot
│   │   │   ├── BestPathView.tsx      # Best-path linear visualization
│   │   │   ├── EvaluationView.tsx    # Metrics, review priority, stdout/stderr
│   │   │   └── PromptView.tsx        # LLM prompt/response viewer (markdown rendering)
│   │   └── home/
│   │       └── HomeContent.tsx       # Main layout: workspace, panels, modals, context menus
│   ├── i18n/
│   │   ├── index.tsx                 # i18next provider, hook, and imperative translator
│   │   ├── config.ts                 # Typed locale parsing and local-storage persistence
│   │   ├── resources.ts              # English and Simplified Chinese catalogs
│   │   ├── config.test.ts            # Locale parsing and persistence tests
│   │   └── resources.test.ts         # Cross-locale key parity contract
│   ├── contexts/
│   │   ├── EvolveShellContext.tsx     # Global state: run status, selection, marks, bans, settings, WS push
│   │   └── WorkspacePanelTabContext.tsx # Tab state for workspace panel
│   ├── hooks/
│   │   ├── useProgramLoader.ts       # Program fetching + incremental push update callbacks
│   │   ├── useHomePageController.ts  # Top-level page orchestration
│   │   ├── useHomeModals.ts          # Modal state management (details snapshots, dedup)
│   │   ├── useAutoRefresh.ts         # Polling fallback (~10 s interval)
│   │   ├── useWebSocketReload.ts     # WS-triggered full reload bridge
│   │   ├── useResizablePanel.ts      # Draggable/resizable floating panel hook
│   │   └── useContextMenus.ts        # Node and canvas context menu state
│   ├── lib/
│   │   ├── api.ts                    # Fetch wrapper; same-origin HTTP and WebSocket URLs through /api/*
│   │   ├── codex-threads.ts          # Codex thread cache (per-resultsDir isolation)
│   │   ├── maestro-access.ts         # Backend-authorized chat dataset and directory
│   │   └── useWebSocket.ts           # WebSocket hook with reconnect
│   ├── utils/
│   │   ├── program.ts                # Score extraction, correctness checks, naming
│   │   ├── math.ts                   # Cosine similarity, hierarchical clustering
│   │   └── embeddingAccessors.ts     # Code/reasoning embedding access by source setting
│   ├── config.ts                     # Feature flags
│   └── types.ts                      # Program, Metadata, WSMessage, and other TypeScript interfaces
├── backend/
│   └── main.py                       # FastAPI: DB scanning, program fetching, meta/PDF, interactive control, WS
├── start.py                          # Launch script: starts backend + frontend + optional runner
├── next.config.ts                    # Fallback rewrites /api/* → backend via API_PROXY
├── package.json                      # Bun workspace member dependencies
└── biome.json                        # Code formatter config
```

## Backend API

| Endpoint | Method | Purpose |
| -------- | ------ | ------- |
| `/list_databases` | GET | Scan `SEARCH_ROOT` for selectable `.sqlite` / `.db` files, excluding the registered guide |
| `/get_programs` | GET | Fetch all programs (with optional timestamp check for incremental updates) |
| `/get_meta_files` | GET | List `meta_*.txt` files (checks both db dir and `meta/` subdirectory) |
| `/get_meta_content` | GET | Read meta file content by generation |
| `/experiment_config` | GET | Read experiment config, including whether it uses custom review prioritization |
| `/download_meta_pdf` | GET | Export summary as PDF locally or plain text in public-demo mode |
| `/api/callback` | POST | Receive `program.queued` / `program.generated` push events from runner |
| `/api/run/status` | GET | Read interactive run status |
| `/api/run/pause` | POST | Pause the running evolution |
| `/api/run/resume` | POST | Resume a paused evolution |
| `/api/run/step` | POST | Submit one additional proposal then auto-pause; extend an exhausted target to include it |
| `/api/run/start` | POST | Start evolution (from waiting_for_start state) |
| `/api/run/stop` | POST | Stop the evolution run |
| `/api/run/set_target` | POST | Change the target generation count |
| `/api/run/suggest` | POST | Submit an expert suggestion for a specific parent |
| `/api/run/merge` | POST | Submit a cross-program merge request |
| `/api/run/ban` | POST | Exclude programs from runner selection |
| `/api/run/unban` | POST | Restore programs to runner selection |
| `/api/run/banned` | GET | Read banned program IDs |
| `/api/run/commands` | GET | List recent interactive commands |
| `/api/run/review_prioritization_settings` | GET, POST | Read or update prioritization mode and thresholds |
| `/api/review_prioritization/status` | GET | Read prioritized programs and prioritization-loader errors |
| `/ws/{db_path}` | WS | Real-time push updates for program, run-status, and review-priority events |
| `/api/codex/start` | POST | Start a new Maestro chat thread (SSE streaming) |
| `/api/codex/chat` | POST | Send follow-up message on existing thread (SSE streaming) |
| `/api/codex/history` | GET | Retrieve chat history for a program pair |
| `/api/codex/global-start` | POST | Start or resume the experiment chat (SSE streaming) |
| `/api/codex/global-chat` | POST | Send an experiment-chat follow-up (SSE streaming) |
| `/api/codex/global-history` | GET | Retrieve the experiment chat history |
| `/api/codex/reset` | POST | Forget the authorized experiment or program-pair conversation and cancel its active turn |

**Access control:** Trusted-local mode supports ordinary datasets and does not authenticate visitors.
Explicit `--public-demo` mode restricts HTTP and WebSocket access to one configured mutable mock database and the fixed read-only guide, with WebSockets authorized before acceptance.
Database discovery exposes only that working run; sidecar reads reject traversal and symlinks, and summary exports use plain text without invoking a PDF renderer.
All seven Maestro routes reject requests in public-demo mode before backend, session-file, or Codex access.
Runner callbacks require a generated bearer credential kept on the backend and runner, never in frontend environments or browser URLs; authenticated callbacks use loopback URLs and bypass environment proxies.
Anonymous visitors share the same mock run and controls; this mode does not create visitor accounts or private per-user sessions.
DNS, TLS, external proxy configuration, and deployment rate limits remain host responsibilities.

## Communication Model

Push-primary, poll-fallback:

```
┌──────────┐  POST /api/callback   ┌──────────────┐   WebSocket push   ┌────────────┐
│  Runner  │ ─────────────────────→│  FastAPI      │ ─────────────────→│  React UI  │
│ (Shinka) │  program.queued       │  backend      │  program.queued   │  (Next.js) │
│          │  program.generated    │               │  program.generated│            │
└──────────┘                       │               │  run.status       └────────────┘
      │                            │               │  review_priority.assigned       │
      │  writes to SQLite          │               │  programs.updated       │
      └───────────────────────────→│  polls SQLite │  (fallback, ~30 s)     │
                                   │  (~2–10 s)    │←──────────────────────  │
                                   └──────────────┘  GET /get_programs      │
                                                     (auto-refresh, ~10 s)  │
                                                                      ┌────────────┐
                                                                      │ programs.  │
                                                                      │ sqlite     │
                                                                      └────────────┘
```

**Primary path (push):** The runner's `EventNotifier` POSTs lifecycle events to `/api/callback`. The backend broadcasts via WebSocket to connected frontends. Sub-second updates with program data inline.

**Fallback path (poll):** SQLite polling catches missed callbacks. The backend polls program count (~30 s), interactive status (~2 s), and review priorities (~10 s). The frontend auto-refreshes via REST (~10 s).

**Ghost node lifecycle:** `program.queued` → ghost node (dashed border, reduced opacity). `program.generated` → upgrade to real node in-place. Ghost nodes survive REST reloads via merge logic.

## State Management

Global state via `EvolveShellContext` (React context + `useReducer`):

- `selectedProgramId`, `mergeSelection` — selection and multi-select (up to 5)
- `markedNodeIds`, `nodeNotes` — user annotations, persisted to localStorage
- `bannedNodeIds` — locally cached ban state, synchronized with the selected database's `banned_programs` table
- `runStatus` — interactive run state (`run_state`, `generation`, `queued_jobs`, `target_generations`)
- `settings` — user preferences (`EvolveSettings`), persisted to localStorage
- `reviewPriorityNotifications` — push-based review-priority alerts
- `programUpdateCallbackRef` — ref for incremental push update callbacks from `useProgramLoader`

Settings (`EvolveSettings`) include: `showErrorNodes`, `showTimeoutNodes`, `includeErrorInStats`, `includeTimeoutInStats`, `showCrossLinks`, `proportionalSectors`, `unifyMutationTypes`, `embeddingSource` (code/reasoning, auto-defaults to reasoning when available), `colorMap` (blues/viridis), `colorMidpoint` (median/average, which controls the performance color-scale midpoint), `dissimilarityThreshold`, and `mergeDiversityWeight`.
The Tree tab uses `TreeVisualizationNew`; there is no visualization-mode setting.
The Merge weight is constrained to `0`–`1`; its complement weights normalized program quality.
Toggles for error/timeout/crossover nodes are auto-disabled when no such nodes exist in the dataset.
Setting descriptions use clickable help icons (`?`) instead of hover tooltips.
The tree legend also hides node-type labels (Error, Timeout, Human) when no such nodes exist.

Review-prioritization settings are shared runtime state rather than frontend preferences. The API and runner both read and write the complete JSON value at `interactive_status["review_prioritization_settings"]` through `InteractiveDatabase`. After a settings update, the backend reapplies the thresholds to cached `review_priority_metrics`; subsequent programs use the same saved settings without restarting the runner. This post-evaluation pipeline only routes expert attention and is separate from pre-evaluation candidate rejection through `NoveltyJudge`.

## Reasoning embedding consumers

Cluster filters intentionally retain the stored full-population PCA coordinates and cluster assignments.
Hiding nodes changes visibility without recomputing the projection, so remaining nodes keep their spatial context; hidden vectors still influence the stored layout.

`embeddingAccessors.ts` requires nonempty finite numeric vectors with a finite nonzero norm before exposing an active embedding.
Availability and the existing Code/Reasoning default selection use this accessor, and reasoning PCA/cluster access additionally requires a usable underlying vector.
The backend's read-only program endpoint normalizes legacy reasoning fields in memory without changing SQLite journal settings; DELETE-mode release snapshots can be browsed directly.
Interactive GET endpoints and WebSocket polling use `InteractiveDatabase(read_only=True)` and read-only SQL connections, so browsing does not create missing control tables or alter snapshot hashes.
Missing reasoning vectors and coordinates use `[]`, and the cluster field is nullable.

Similarity analysis excludes unusable vectors while keeping labels aligned, and incompatible selected dimensions produce a localized English/Simplified Chinese message.
The shared cosine helper returns `null` for unavailable comparisons, so the tree skips invalid chords.
Island chords can still anchor at seed roots without embeddings because their actual comparison uses valid island-best vectors.
Merge preserves candidates with missing or incompatible embeddings: measured `cosineDistance` stays `null`, the raw diversity input stays `0.5` before normalization, and an entirely unavailable embedding population uses quality-only ranking.

See [Reasoning embeddings](../docs/architecture/reasoning-embeddings.md) for source-text filtering, runtime persistence, and the offline release-copy repair.

## Runtime Configuration

The browser sends HTTP requests to `/api/*` and connects to `/api/ws/*` on the frontend origin.
Next.js rewrites unmatched requests and WebSocket upgrades to the server-only `API_PROXY` target, which defaults to `http://127.0.0.1:8000` and is set by the launcher to the selected backend port.
Frontend `/api/codex/*` routes remain local Next.js handlers.
There is no runtime configuration endpoint returning the backend address or a shared token to browsers.
`PUBLIC_BACKEND_URL` and `NEXT_PUBLIC_API_BASE` are no longer used.

The launcher binds FastAPI to `127.0.0.1` and gives local runners `EVOLVE_SHELL_URL` for callbacks.
Publish only the frontend port behind the demo origin `https://evomaestro-demo.reify.ing`, with WebSocket upgrades enabled; see [mock deployment routing](../docs/guides/mock-examples.md#single-origin-demo-routing).
Same-origin routing alone does not authenticate users; the explicit public-demo policy enforces the dataset and endpoint restrictions described above.

## Expert Steering Features

- **Score-based filtering:** Right-click a correct node → "Filter" dims nodes below its score (0.15 opacity). "Remove Filter" in node and canvas context menus. Also available in Selected Programs panel.
- **Node banning:** Ban/Unban via context menu or Selected Programs dims banned nodes and excludes them from runner parent and inspiration selection.
  Ban state is stored in SQLite's `banned_programs` table, cached in localStorage, and hydrated from the backend when selecting a database.
  Multi-select supports mixed state; banned programs are also excluded from Suggest and Merge actions.
- **Expert Suggestion modal:** Shows the node's `meta_recommendations` as a collapsible markdown reference. Supports full/diff/auto patch types.
- **Merge partner recommendations:** Ranks eligible partners by a persisted quality–diversity balance from Settings. The modal shows normalized quality, normalized diversity, and the combined ranking score, and falls back to quality-only ranking when embeddings are unavailable.
- **Evolution Overview sidebar:** Floating button opens a non-blocking sidebar with the latest global insights scratchpad. Auto-refreshes when new programs arrive. Hidden when no meta files exist.
- **Dissimilarity analysis:** Heatmap of `1 - cosine_similarity` (range 0–2, RdBu color scale) with PCA scatter plot for multi-node comparison.
- **Node details:** Expandable patch description (markdown), patch summary, thought process rendering.

## Maestro Chat Integration

Seven server-side API routes (`/api/codex/*`) provide program and experiment chat through `@openai/codex-sdk`:

- **Dataset authorization:** Every route requires `dbPath` and asks FastAPI's `GET /maestro_context?db_path=…` to resolve its canonical dataset before accessing Codex or conversation files. `mock-demo` and the read-only guide are rejected with HTTP 403. Missing identities, invalid databases, and paths outside the configured root are rejected; backend errors fail closed with HTTP 503.
- **Working directory:** The backend returns the actual database's parent directory after checking it is a program database through a read-only SQLite connection. Client-supplied directories and role flags do not select a working directory or enable chat. Maestro can read `gen_N/main.{ext}` files and query `programs.sqlite` when folders are missing.
- **Three modes:** `code_view` (single program), `code_change` (parent→child), `code_diff` (two-program comparison).
- **Thread persistence:** Thread-to-program-pair cache in `.codex-threads.json`, scoped per `resultsDir` for user study isolation. Session files in `~/.codex/sessions/`.
- **Durable reset:** Clear conversation first removes the authorized cache binding, then aborts any active SDK turn. Per-turn ownership checks prevent late stream or history completion from recreating the binding; the next message starts a new thread. SDK session files are retained, so Clear resets the conversation without deleting the host’s Codex archive.
- **Client lifecycle:** History, streaming, and reset requests share cancellation and ownership tracking. A reset failure preserves the visible transcript and shows a localized error; sending, clearing, switching selection, or unmounting cancels superseded requests.
- **Schema prompts:** Both program and experiment prompts name the database’s `combined_score` column.
- **Follow-up ownership:** A supplied conversation ID must match the authorized dataset's cached experiment thread or program pair before resuming.
- **Demo presentation:** Maestro Chat stays visible for `mock-demo`. Both chat panel types render the same bilingual locked view with disabled input and a local-deployment explanation, without mounting history/configuration effects or send handlers. Dataset capability loading also keeps chat locked; mock evolution is unaffected.
- **SSE streaming:** Responses stream as Server-Sent Events via `ReadableStream`.
- **Sandbox:** All threads use `sandboxMode: "danger-full-access"` for Linux container compatibility.

## Startup

`start.py` orchestrates backend, frontend, and optional evolution runner:

```
uv run --locked --all-packages python start.py --shinka-search-root <search_root> [options]

Options:
  --backend-port 8000        FastAPI port
  --frontend-port 3000       Next.js dev server port
  --release                  Build & run production
  --skip-build               Reuse only a build matching the final backend port
  --public-demo              Restrict access to the selected mock database and guide
  --open                     Auto-open browser
  --auto-port                Find available ports if conflict
  --db <path>                Pre-select database
  --example-runner <script>  Launch evolution runner subprocess
  --runner-args <args>       Extra args for runner (e.g. --resume, --interactive)
```

Environment variables set automatically: `SHINKA_SEARCH_ROOT`, `API_PROXY`, `EVOLVE_SHELL_URL`.
Public mode also sets `EVOMAESTRO_PUBLIC_DEMO=1` for Next.js and passes `EVOMAESTRO_CALLBACK_TOKEN` only to the mock runner; the in-process backend retains the generated credential as a secret value.
The public launcher requires an explicit working mock database and permits only the checked-in interactive sandbox runner.
Runner arguments use shell-aware parsing, and stale production proxy manifests fail before any services start.

The visible **Continue** control resumes a paused run through `/api/run/resume`, which queues the `RESUME` command.

## Container deployment

The [Docker deployment](../docker/README.md) builds the interface with `EVOMAESTRO_STANDALONE=1` and a fixed `API_PROXY=http://127.0.0.1:18001`.
The standalone server runs on port 13000, while Supervisor manages FastAPI and the mock runner independently so each process can restart after failure.
`docker/runtime.py` configures the existing public-demo policy directly, stores its callback credential in private tmpfs, and initializes or resumes one durable mock working copy.
The ordinary local launcher remains `start.py`; container startup uses the prebuilt standalone server and does not run Bun or rebuild assets.

## Guided walkthrough

`useGuideSession` owns preparation, running, and restoration for every Guide entry point.
`page.tsx` retains the original workspace inside React's `Activity` boundary while mounting an isolated provider for the guide.
Hidden workspace effects disconnect, while React state and DOM are preserved for restoration; the guide's settings and annotations are temporary.
Ordinary dataset switches key the provider by dataset identity, and HTTP requests and WebSocket reconnection callbacks are cancelled when their owner is disposed.
A per-tab recovery record and selected-dataset record restore the original dataset on reload.

The backend resolves the configured `mock-guide` independently of `SEARCH_ROOT` through `backend/datasets.py`.
`GET /guide_dataset` exposes its public identity, while `GET /dataset` exposes role, read-only capability, `maestro_chat_enabled`, and illustrative-summary provenance.
`GET /list_databases` excludes the registered guide whether it is inside or outside the search root, so the ordinary menus contain no synthetic `examples` task or `mock-guide` result.
`Controls` hides the Task and Result selectors and skips discovery requests during the isolated guide session; exiting restores the original workspace and its selectors.
`dataset.json` marks imported guide copies as read-only too.
The HTTP mutation guard and writable-database entry point reject guide writes before opening a writable connection.
The UI keeps explanation targets visible while disabling live actions and displaying Guide preview.

`guided-tour/steps.tsx` contains bilingual step content, beginning with an unnumbered `TourWelcomeStep` that explains the temporary mock dataset.
The welcome uses the shared interface language and a Start Tour button; main-step and extended-step numbering excludes this introduction.
The mock-data notice appears only in the welcome card, so it does not occupy a persistent banner or change the workspace height.
`guided-tour/transitions.ts` provides shared forward/backward preparation, action acknowledgments, visible-target checks, stable bounds, and bounded timeouts.
The Dissimilarity Arcs step explicitly fits the tree on every entry, so Back from the zoomed context-menu step restores the same viewport as forward navigation.
Its card appears only after the viewport-ready event and stable anchor bounds.
Leaving the context-menu sequence in either direction also fits the tree before the destination card appears; consecutive menu steps retain their shared node focus and menu.
Preparation waits until departing menus, the overview sidebar, and settings are no longer visible, including the sidebar's closing animation.
Node context menus measure their rendered size and stay within the viewport after opening, content changes, or resize; menus taller than the window scroll internally.
Context-menu guide cards prefer the right side but can flip to the left, bottom, or top, keeping tall illustrated content inside narrower windows.
Selectors are scoped to the guide workspace so retained original DOM cannot become a target.
Joyride is unmounted while transitioning, preventing it from retaining a detached menu target; missing-target recovery is bounded and errors restore the original workspace.

`OverviewSidebar` tracks user versus guide opening explicitly.
`overviewContent.ts` selects real content, a normal empty explanation, or a guide-only illustrative fallback after successful loading.
Global insights are extracted using Markdown tokens, from the scratchpad's top-level heading to the next top-level heading; fenced and indented code blocks stay intact even when comments resemble section headings.
The packaged example and fallback share `src/fixtures/guide-summary.json`; its English and Simplified Chinese versions are labeled as mock content.
Loading and request errors remain distinct from absence, and stale requests cannot replace another dataset's summary.

See [Mock examples](../docs/guides/mock-examples.md) for launch, deployment, and fixture-preparation workflows.

## UI Localization

The application uses a shared `i18next` instance exposed through `I18nProvider` and `useI18n`:

- The toolbar language switch toggles English and Simplified Chinese immediately and persists the locale under `evomaestro-ui-language`.
- React components use stable catalog keys; imperative D3 tree renderers use the same instance through `translateUi`.
- English and Chinese catalogs must expose identical, nonempty leaf keys, enforced by `resources.test.ts`.
- Application-owned chrome and messages are localized. Experiment content, program metadata, metric keys, source code, logs, raw backend details, and Maestro-generated content remain verbatim.

## Node Identifiers

Path → Best card headers reuse the purple `ProgramChips` component from Details, displaying the localized Node label, generation number, and short clickable ID.
The existing patch name remains beside the pill, while the patch type, score, and patch description remain in the card body.
The short ID in the pill is the card's only ID display; there is no separate full-ID row.
The Patch Type field uses the same localized labels and mutation-unification setting as Details: `diff` and `full` display as Mutation when unified, or Diff and Full rewrite when shown separately.
Pill IDs retain the shared `NodeID` highlighting, tree navigation, and copy interactions; clicking the rest of the card selects its program.

## Node Shape Unification

The `unifyMutationTypes` setting defaults to enabled: `diff` and `full` render as circles and share the localized Mutation label in the legend, tooltips, Details, Programs, and Path → Best.
Disabling it shows Diff as a square and Full rewrite as a circle, with separate labels.
The `cross` patch type retains its cross shape, and the underlying `patch_type` in the database is unchanged.

## Tree View Preservation

The tree view uses `display: none` instead of conditional rendering when switching tabs, preserving D3 zoom/pan state across tab switches.

## Related Documents

- **ShinkaEvolve core architecture**: [`../docs/architecture/shinka-evolve.md`](../docs/architecture/shinka-evolve.md)
