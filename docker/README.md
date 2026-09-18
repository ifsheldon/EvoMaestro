# Docker hosting

[English](README.md) | [简体中文](README.zh-CN.md)

One container runs the mock demo frontend, private backend, simulated runner, project page, and two ShinkaEvolve viewers.
Supervisor manages the six processes, and Compose uses `restart: unless-stopped`.
No model credentials, Codex login, reverse proxy, or cloudflared configuration are needed inside the container.

## Build and start

Requirements: Docker Engine with Compose v2 or newer and the initialized, pinned ShinkaEvolve submodule.
Run from the repository root; prepend `sudo` to Docker commands if your account requires it:

```sh
git submodule update --init --recursive
docker compose -f docker/compose.yaml up -d --build --wait --wait-timeout 180
docker compose -f docker/compose.yaml ps
```

The build installs locked dependencies with uv and Bun, then builds both Next.js apps in standalone production mode.
The runtime contains their traced dependencies and Python runtime dependencies, without build tools or development servers.
Building requires network access for packages, base images, and Google Fonts; runtime model calls are simulated.
The Dockerfile-specific ignore file excludes credentials, local working runs, dependency directories, Git metadata, and build output, and selects only the bundled recorded runs.

## Cloudflared origins

Configure your host's cloudflared tunnel with these HTTP origins:

| Public hostname | Host origin |
| --- | --- |
| `evomaestro-demo.reify.ing` | `http://127.0.0.1:13000` |
| `evomaestro.reify.ing` | `http://127.0.0.1:13001` |
| `shinka-mop.reify.ing` | `http://127.0.0.1:19870` |
| `shinka-graph-mop.reify.ing` | `http://127.0.0.1:19871` |

All published ports bind only to host loopback.
The mock frontend proxies HTTP and WebSocket requests to `127.0.0.1:18001` inside the container; this backend port is never published.
Preserve WebSocket upgrades on the demo hostname.
DNS, TLS, tunnel routing, and any public rate limits are managed outside this Compose project.

Override host ports through `EVOMAESTRO_DEMO_PORT`, `EVOMAESTRO_PROJECT_PORT`, `EVOMAESTRO_MOP_PORT`, and `EVOMAESTRO_GRAPH_MOP_PORT`.
For example, from the repository root:

```sh
EVOMAESTRO_DEMO_PORT=23000 docker compose -f docker/compose.yaml up -d --wait
```

Reuse the same overrides for subsequent Compose commands.
Host-port changes need no rebuild; the internal backend port is fixed in the production proxy configuration.

## State and access

The first launch atomically copies the five-node mock seed into `/data/mock-demo` on the `mock-data` named volume.
Restarts and rebuilds reuse that copy; an invalid existing database fails initialization instead of resetting progress.
Click Start to begin the demo; resumed evolution waits for user control.
Visitors share this working copy and its controls.
The fixed guide, MOP's two recorded runs, and GraphMOP's recorded run remain in the read-only image.
During the build, image copies use SQLite's DELETE journal mode so browsing needs no writable WAL sidecars; repository snapshots and their logical data remain unchanged.

The backend uses the existing public-demo policy, and all Maestro routes stay disabled.
A generated callback credential lives only in private runtime tmpfs and is supplied to the backend and mock runner, never to the browser or Next.js environment.
The container runs as UID/GID `10001`, with a read-only root filesystem and no host source or credential mounts.
Only the mock data volume persists; temporary files and Next.js caches use tmpfs.

The Shinka launchers reuse existing HTML and browsing handlers with a dataset allowlist, traversal and symlink rejection, and an explicit static-file allowlist.
MOP requests cannot select GraphMOP or the mutable mock run, and vice versa.
Older snapshots without `attempt_log` expose no failed-proposal nodes; browsing does not add tables or migrate bundled databases.

## Operations

Run from the repository root:

```sh
docker compose -f docker/compose.yaml logs -f --tail=100
docker compose -f docker/compose.yaml exec web supervisorctl -c /app/docker/supervisord.conf status
docker compose -f docker/compose.yaml restart
docker compose -f docker/compose.yaml stop
docker compose -f docker/compose.yaml start
```

Supervisor restarts exited service processes and terminates their process groups on shutdown.
The health check probes all four sites, each recorded database, the private API, and the runner heartbeat.
A health failure is visible in `docker compose ps`; Docker does not restart a container merely because it is unhealthy.
Repeated startup failures eventually mark the affected Supervisor process FATAL; inspect logs, correct the cause, and restart the container.
Docker's local log driver rotates container logs; generated run artifacts in the data volume accumulate as visitors evolve programs.

Rebuild after updating the checkout with the same `up -d --build --wait` command.
Use `docker compose -f docker/compose.yaml down` to remove the container while retaining the working run.
Adding `--volumes` to `down` permanently deletes the mock working run; the next launch starts from the bundled seed.
Stop the container before backing up the named volume so SQLite and run artifacts are consistent.

## Development checks

From the repository root:

```sh
docker compose -f docker/compose.yaml config --quiet
uv run --locked --all-packages ruff check docker
uv run --locked --all-packages ruff format --check docker
SHINKA_PRICING_MODE=offline uv run --locked --all-packages pytest docker/test_runtime.py
```

Tests cover restart persistence, failed initialization, snapshot-preserving browsing, and public path confinement.
The image build validates both standalone Next.js builds.
See [mock workflows](../docs/guides/mock-examples.md) for local development and [interface architecture](../evomaestro-interface/architecture.md) for the existing public-demo contracts.
