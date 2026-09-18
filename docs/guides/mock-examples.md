# Mock examples and guided walkthrough

The release has four datasets: MOP, GraphMOP, `mock-demo`, and `mock-guide`.
All four datasets are bundled in `datasets/`; MOP and GraphMOP contain both their harness code and recorded runs, while the mock directories contain snapshots.
No separate download is required.
`mock-demo` starts with five initial island nodes and no evolution summary.
`mock-guide` is a fixed 38-node snapshot of the interactive sandbox, including a crossover and an explicitly illustrative summary in English and Simplified Chinese.
All mock LLM responses, embeddings, and evaluation scores are simulated.

## Browse the bundled datasets

After `uv sync --locked --all-packages` and `bun install --frozen-lockfile` in the repository root, run from `evomaestro-interface/`:

```sh
uv run --locked --all-packages python start.py \
  --shinka-search-root ../datasets \
  --guide-db ../datasets/mock-guide/programs.sqlite \
  --backend-port 8001 --frontend-port 3000 --release
```

Open `http://localhost:3000` and select a dataset in Result.
The Task and Result menus exclude the registered `mock-guide` fixture and its synthetic `examples` task; open the fixture through Guide.
Browsing starts no evolution runner.
The `--guide-db` option, or `EVOLVIS_GUIDE_DB`, registers the guide independently of the search root.
Without an override, the launcher uses `datasets/mock-guide/programs.sqlite` relative to the repository.

## Run the interactive demo

From the repository root:

```sh
uv run --locked --all-packages poe start-mock-interactive
```

The launcher creates a new five-node working copy under the ignored `mock-runs/` directory in the checkout, then starts the backend, frontend, and mock runner together.
Click Start to begin evolution; Pause and Continue control the connected runner.
The terminal prints the working-copy location, which is retained after shutdown.
The release package and fixed guide remain intact.
Use `uv run --locked --all-packages python evomaestro-interface/tools/start_mock_demo.py --help` for dataset-directory and port overrides.
`--release-data` defaults to `datasets/`; with an override, working copies are created in `mock-runs/` beside that selected directory.

To resume a particular working copy directly:

```sh
SHINKA_PRICING_MODE=offline uv run --locked --all-packages python ShinkaEvolve/examples/interactive_sandbox/run_evo.py \
  --resume --results-dir /absolute/path/to/mock-demo
```

A fresh run requires a new destination; the runner no longer deletes an existing sandbox directory automatically.
`--init-only --results-dir DESTINATION` creates the five starting nodes without submitting evolution jobs.
A validated zero-cost mock pricing catalog is installed before constructing the runner.
Resuming a generation-zero database preserves its original seed IDs.

## Maestro Chat in the online demo

For datasets marked `mock-demo`, the Maestro Chat button remains available, but the experiment, code, and diff chat panels show a locked view with disabled input.
The notice explains that chat is disabled in the online demo and that users can deploy EvoMaestro on their own machine and use their own ChatGPT subscription.
No chat history or model requests are made by these panels.
The backend also rejects direct chat start, follow-up, history, and reset requests for mock datasets before opening a Codex client or reading conversation files.
Mock evolution controls remain interactive; the fixed guide retains its existing restrictions.

For public demonstrations, use `start_mock_demo.py --release --public-demo` or `uv run --locked --all-packages poe start-mock-interactive-published`, which enables the anonymous-demo policy for the demo working copy and registered guide.
Keep the working copy's `dataset.json`; its `mock-demo` role carries the restriction even when the folder is renamed.
Trusted-local mode enables Maestro for ordinary MOP and GraphMOP datasets.
Use the explicit public-demo launcher for anonymous hosting; it rejects ordinary datasets and disables every Maestro route.

For personal use, deploy EvoMaestro locally, run `codex login` to sign in with your own ChatGPT account, and open an ordinary experiment dataset.
The `mock-demo` dataset stays locked in local deployments too.
See the official [Codex authentication instructions](https://learn.chatgpt.com/docs/auth#sign-in-with-chatgpt).

## Single-origin demo routing

The planned demo origin is `https://evomaestro-demo.reify.ing`.
Run `uv run --locked --all-packages poe start-mock-interactive-published` and configure the existing HTTPS reverse proxy or tunnel to forward that origin to the frontend on `127.0.0.1:3000`, including WebSocket upgrades.
Do not publish a separate backend hostname or forward the backend port.
The launcher binds FastAPI to `127.0.0.1:8001`; its server-only `API_PROXY` setting connects Next.js to that port.
The domain is deployment configuration, not a browser API environment variable.

```text
Browser → https://evomaestro-demo.reify.ing → Next.js :3000
  /api/codex/* → local Next.js handlers (mock datasets reject chat)
  /api/*      → private FastAPI :8001
  /api/ws/*   → private FastAPI WebSocket /ws/*
```

Both HTTP and WebSocket traffic use the same frontend origin in local development and production.
The browser receives no private proxy address or shared token from `/api/config`; that route has been removed.
WebSocket URLs contain no authentication token.
A production build records the proxy rewrite target.
With `--release --skip-build`, the launcher validates that target against the final backend port, including automatic port selection, before starting services.
A missing, malformed, or mismatched manifest stops startup with an instruction to rerun without `--skip-build`.
The reverse proxy must support WebSocket upgrades, and DNS/TLS/proxy configuration must be verified on the deployment host before announcing the demo as live.

The published task selects `--public-demo`, which allows anonymous visitors to share one mutable mock working copy and the fixed read-only guide.
Visitors share the same evolution controls and progress; the demo does not create private visitor sessions.
HTTP and WebSocket requests for other databases are rejected, all Maestro routes are disabled, and summary downloads use plain text without a server-side PDF renderer.
The launcher generates a private callback credential for the backend and mock runner; it is not supplied to Next.js or the browser.
Authenticated runner callbacks use loopback URLs and ignore environment proxies.
Keep FastAPI private behind the frontend, and configure DNS, TLS, WebSocket support, and deployment rate limits on the hosting proxy.
`--release` alone only selects an optimized frontend build; ordinary local mode is not intended for untrusted public users.
The remaining deployment checks are tracked in [the public-hosting checklist](../maintenance/release-checklist.md#before-public-hosting).

### 中文说明

计划使用的演示域名为 `https://evomaestro-demo.reify.ing`。
运行 `uv run --locked --all-packages poe start-mock-interactive-published`，将现有 HTTPS 反向代理或隧道指向本机前端 `127.0.0.1:3000`，并启用 WebSocket 转发。
不要为后端单独发布域名或转发端口；启动器将 FastAPI 绑定到 `127.0.0.1:8001`，Next.js 通过仅服务端使用的 `API_PROXY` 访问后端。
浏览器的 HTTP 请求和 WebSocket 连接均通过前端同源的 `/api` 路由，不再获取后端地址或共享令牌。
生产构建会记录代理目标；使用 `--release --skip-build` 时，启动器会在启动服务前检查其是否匹配最终后端端口，包括自动选择的端口。
构建清单缺失、损坏或端口不匹配时，启动器会停止，并提示移除 `--skip-build` 后重新构建。
上线前仍须在部署主机上验证 DNS、TLS 和 WebSocket 转发。
发布启动任务会启用 `--public-demo`，允许匿名访客共享同一个可交互模拟工作副本，并浏览固定的只读导览。
访客共享演化控制与进度，不会获得独立的私有会话。
HTTP 和 WebSocket 请求只能访问这两个数据库；全部 Maestro 路由被禁用，摘要下载使用纯文本，不调用服务端 PDF 渲染器。
启动器为后端和模拟运行器生成私有回调凭据，不传给 Next.js 或浏览器；带凭据的回调只连接回环地址，并忽略环境代理。
保持 FastAPI 端口私有，在部署代理上配置 DNS、TLS、WebSocket 支持与限流。
单独使用 `--release` 只启用优化构建；普通本地模式不适合直接向不可信访客开放。

## Guide behavior

Every Guide entry temporarily loads the registered `mock-guide` in the radial Tree view.
The first card welcomes the user and explains that the guide uses mock data and returns to the previous dataset on exit.
Start Tour opens the first of 18 numbered main steps; the welcome card is unnumbered, and no persistent notice banner is shown.
Next and Back prepare the destination view before displaying its card; leaving the node context menu restores the full tree, and departing panels finish closing first.
Context menus stay within the window, and their guide cards can move to the opposite side when space is limited.
Finish, Skip, Close, Escape, preparation cancellation, and errors share cleanup and restoration.
The previous workspace is retained with its tab, selection, filters, and layout; reloading during the guide restores the original dataset.
The guide has separate temporary preferences and annotations, so its state does not overwrite the original workspace.
The Task and Result selectors are hidden during the guide, evolution-changing actions are disabled, and the backend rejects mutations even when called directly.
Run Control displays Guide preview rather than a stale generation-backend warning.

The summary button remains hidden when no summary exists.
An ordinary empty sidebar explains that the first summary can take several generations when summarization is enabled.
Only a guide opening of an empty sidebar substitutes the labeled illustrative summary.
Real summaries and loading errors are never replaced by that fallback.

## Prepare mock release artifacts

Run from the repository root with a new destination:

```sh
SHINKA_PRICING_MODE=offline uv run --locked --all-packages python evomaestro-interface/tools/prepare_mock_datasets.py \
  --guide-source /absolute/path/to/populated/interactive_sandbox/results_sandbox \
  --output /absolute/path/to/new/mock-artifacts
```

The command snapshots committed SQLite WAL data, initializes a fresh demo, preserves program payloads, adds the fixture metadata, checks integrity, and publishes both datasets only after validation.
It fills missing seed review-cache rows and refreshes reasoning projections with the shared offline maintenance routine, preserving all vector payloads and historical priorities.
It rejects an existing destination, source-contained outputs, source symlinks, empty guide data, and missing crossover examples.
`--demo-source` can reuse an already initialized five-node dataset.
See the [archived implementation plan](../archive/mock-guide-implementation-plan.md) for design history and the [dataset guide](../../datasets/README.md) for the current bundled snapshots.
