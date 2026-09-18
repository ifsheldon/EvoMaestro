# syntax=docker/dockerfile:1
ARG NODE_VERSION=22.22.1
ARG BUN_VERSION=1.4.2
ARG UV_VERSION=0.12.16

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv
FROM oven/bun:${BUN_VERSION} AS bun
FROM node:${NODE_VERSION}-bookworm-slim AS node

FROM node AS web-build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 HUSKY=0 EVOMAESTRO_STANDALONE=1
COPY package.json bun.lock bunfig.toml ./
COPY evomaestro-interface/package.json evomaestro-interface/package.json
COPY project-page/package.json project-page/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile
COPY evomaestro-interface/ evomaestro-interface/
COPY project-page/ project-page/
WORKDIR /app/evomaestro-interface
RUN API_PROXY=http://127.0.0.1:18001 EVOMAESTRO_PUBLIC_DEMO=1 bun run build
WORKDIR /app/project-page
RUN bun run build

FROM python:3.12-slim-bookworm AS python-build
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY pyproject.toml uv.lock README.md ./
COPY ShinkaEvolve/ ShinkaEvolve/
COPY evomaestro-interface/pyproject.toml evomaestro-interface/README.md evomaestro-interface/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --all-packages --no-default-groups --no-editable
COPY --chmod=755 datasets/ datasets/
# The committed MOP snapshots retain WAL headers. Normalize only image copies
# so read-only SQLite clients do not need to create shared-memory sidecars.
RUN /app/.venv/bin/python - <<'PY'
"""Prepare checkpointed image copies for a read-only runtime."""
import sqlite3
from contextlib import closing
from pathlib import Path

for database in Path("/app/datasets").rglob("programs.sqlite"):
    with closing(sqlite3.connect(database)) as connection:
        if connection.execute("PRAGMA journal_mode=DELETE").fetchone() != ("delete",):
            raise RuntimeError(f"Could not checkpoint image snapshot: {database}")
        if connection.execute("PRAGMA quick_check").fetchone() != ("ok",):
            raise RuntimeError(f"Invalid image snapshot: {database}")
PY

FROM python:3.12-slim-bookworm AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends supervisor libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 evomaestro \
    && useradd --uid 10001 --gid 10001 --create-home evomaestro \
    && mkdir -p /data /run/evomaestro \
    && chown 10001:10001 /data /run/evomaestro
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=python-build /app/.venv .venv/
COPY --from=web-build /app/evomaestro-interface/.next/standalone ./
COPY --from=web-build /app/project-page/.next/standalone ./
COPY --from=web-build /app/evomaestro-interface/.next/static evomaestro-interface/.next/static/
COPY --from=web-build /app/project-page/.next/static project-page/.next/static/
# Normalize checkout permissions so root-owned assets are readable by UID 10001.
COPY --chmod=755 evomaestro-interface/public/ evomaestro-interface/public/
COPY --chmod=755 project-page/public/ project-page/public/
COPY --chmod=755 evomaestro-interface/backend/ evomaestro-interface/backend/
COPY --chmod=755 evomaestro-interface/tools/ evomaestro-interface/tools/
COPY --chmod=755 ShinkaEvolve/examples/interactive_sandbox/ ShinkaEvolve/examples/interactive_sandbox/
COPY --from=python-build /app/datasets/ datasets/
COPY --chmod=755 docker/runtime.py docker/viewer.py docker/supervisord.conf docker/
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    SHINKA_PRICING_MODE=offline MPLCONFIGDIR=/tmp/matplotlib \
    XDG_CACHE_HOME=/tmp/cache
USER 10001:10001
EXPOSE 13000 13001 19870 19871
HEALTHCHECK --interval=30s --timeout=15s --start-period=90s --retries=3 \
    CMD ["python", "/app/docker/runtime.py", "healthcheck"]
ENTRYPOINT ["python", "/app/docker/runtime.py", "start"]
