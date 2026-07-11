# syntax=docker/dockerfile:1-labs

FROM node:22-slim AS deps

# Native build dependencies are only needed while installing/building packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip \
    build-essential pkg-config \
    ca-certificates \
    libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests first for better dependency-layer caching.
# --parents preserves the packages/<name>/ structure so npm resolves the whole
# workspace graph without hand-listing every package.json. Adding/removing a
# package needs no Dockerfile change. (Requires the dockerfile:1-labs frontend.)
COPY package.json package-lock.json ./
COPY --parents packages/*/package.json ./
COPY web/package.json web/
# The root postinstall rebuilds better-sqlite3 via this script (see the root
# package.json); it's re-included from the ignored electron/ tree in .dockerignore.
COPY electron/scripts/rebuild-native.mjs electron/scripts/rebuild-native.mjs

RUN npm ci

FROM deps AS build

COPY packages/ packages/
COPY scripts/ scripts/
COPY tsconfig*.json ./
COPY turbo.json ./

RUN npm run build:packages

# Bundle the backend with esbuild (scripts/bundle-backend.mjs — the same
# bundler the Electron app uses; the server profile skips desktop-only natives
# like webgpu/keytar). The bundle is the entire backend runtime artifact:
# server.mjs, the staged external native/lazy packages, provider manifests,
# template examples + thumbnails, and the bundled migration runner — the image
# ships no workspace node_modules tree. esbuild itself resolves from
# /app/node_modules (hoisted from web's devDependency by the plain `npm ci` in
# the deps stage). verify-backend-bundle re-checks the staged layout so a
# staging regression fails the image build, not a deploy.
#
# The bundler stages externals as _modules/ only because electron-builder
# globs exclude any "node_modules" dir; that constraint doesn't exist here, so
# rename it to node_modules and let server.mjs / db-migrate.mjs resolve their
# externals via normal Node resolution. Source maps are dev artifacts — drop.
RUN node scripts/bundle-backend.mjs --out /app/backend --profile server --with-migrate \
    && node scripts/verify-backend-bundle.mjs /app/backend --profile server \
    && mv /app/backend/_modules /app/backend/node_modules \
    && rm -f /app/backend/server.mjs.map /app/backend/db-migrate.mjs.map

COPY web/ web/
ARG WEB_BUILD_NODE_OPTIONS=--max-old-space-size=4096
# The web app learns its auth mode and public Supabase credentials from the
# backend at runtime via GET /api/config, so no VITE_* build args are needed
# here — configure the server (SUPABASE_URL/KEY/ANON_KEY) instead.
#
# .git is excluded from the build context (see .dockerignore), so vite.config.ts's
# git-based fallback can't resolve the commit/build number here — pass them in.
ARG GIT_COMMIT_HASH=unknown
ARG BUILD_NUMBER=0
ENV GIT_COMMIT_HASH=$GIT_COMMIT_HASH \
    BUILD_NUMBER=$BUILD_NUMBER
RUN cd web && NODE_OPTIONS="$WEB_BUILD_NODE_OPTIONS" npm run build \
    && find dist -name '*.map' -delete

FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    NODETOOL_ENV=production \
    HOST=0.0.0.0 \
    STATIC_FOLDER=/app/web/dist \
    CHROMA_PATH=/workspace/chroma \
    ASSET_BUCKET=/workspace/assets \
    HF_HOME=/workspace/hf-cache

# Runtime-only OS packages. Key management is provided through
# SECRETS_MASTER_KEY, not a system keychain inside the container.
#
# Beyond ca-certificates/curl (health check, downloads), this bakes in the
# CLIs that agent skill nodes (execute_bash) and document/video nodes shell
# out to at runtime, so containers don't fail or install tools on every run:
#   ffmpeg            — FFmpeg + yt-dlp downloader agents, video nodes
#   git               — Git agent
#   poppler-utils     — PDF agents, pdf-to-image nodes (pdftoppm/pdftotext)
#   qpdf              — PDF agents (split/merge/optimize/check)
#   pandoc            — document conversion nodes
#   postgresql-client — psql/pg_dump for DATABASE_URL deployments
#   jq/zip/unzip      — everyday shell plumbing for agents
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    ffmpeg git jq zip unzip \
    poppler-utils qpdf pandoc \
    postgresql-client \
    python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /workspace \
    && chown node:node /workspace

# Python tool venv on PATH for every execute_bash call: yt-dlp for the
# downloader agent plus the PDF stack the PDF agent's prompt references.
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir \
       yt-dlp pypdf pdfplumber pypdfium2 reportlab \
    && rm -rf /root/.cache
ENV PATH="/opt/venv/bin:$PATH"

# JS document libraries the DOCX/PDF agents import from ad-hoc Node scripts.
# Installed globally with NODE_PATH set so require('pdf-lib') resolves from
# any workspace directory without a per-run npm install. NODE_PATH only
# affects CommonJS resolution as a last-resort fallback; the ESM server
# ignores it, so /app/backend/node_modules resolution is unchanged.
RUN npm install -g pdf-lib docx && npm cache clean --force
ENV NODE_PATH=/usr/local/lib/node_modules

WORKDIR /app

# The backend bundle is self-contained: server.mjs + node_modules (staged
# externals) + manifests/examples/assets + db-migrate.mjs. web/dist is served
# by the server via STATIC_FOLDER (see ENV above) — no path assumptions.
#
# db-migrate.mjs stays inside backend/ because @nodetool-ai/models (inlined in
# it) imports better-sqlite3 at module top level, which must resolve from the
# adjacent backend/node_modules — even Postgres-only runs load it. Referenced
# by the entrypoint below and fly.toml's release_command.
#
# By default the entrypoint applies migrations on every boot (the migration
# lock keeps concurrent boots safe). Orchestrators that migrate once per
# release in a dedicated step — e.g. Fly's release_command — should set
# NODETOOL_MIGRATE_ON_BOOT=0 so the long-lived app machines don't each re-run
# the migrator on startup. See fly.toml.
COPY --from=build --chown=node:node /app/backend ./backend
COPY --from=build --chown=node:node /app/web/dist ./web/dist

# If no master key is configured, persist a generated 32-byte base64 key next
# to the SQLite database so encrypted secrets survive restarts when /workspace
# is mounted as a volume. For production, pass
# -e SECRETS_MASTER_KEY=$(openssl rand -base64 32).
RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -eu' \
    'if [ -z "${DATABASE_URL:-}" ] && [ -z "${DB_PATH:-}" ]; then' \
    '  echo "ERROR: No database configured. Set DATABASE_URL (PostgreSQL) or DB_PATH (SQLite)." >&2' \
    '  exit 1' \
    'fi' \
    'KEY_FILE="${SECRETS_MASTER_KEY_FILE:-/workspace/.secrets_master_key}"' \
    'if [ -z "${SECRETS_MASTER_KEY:-}" ]; then' \
    '  mkdir -p "$(dirname "$KEY_FILE")"' \
    '  if [ ! -s "$KEY_FILE" ]; then' \
    '    umask 077' \
    '    node -e "process.stdout.write(require(\"crypto\").randomBytes(32).toString(\"base64\"))" > "$KEY_FILE"' \
    '  fi' \
    '  export SECRETS_MASTER_KEY="$(cat "$KEY_FILE")"' \
    'fi' \
    'if [ -n "${DATABASE_URL:-}" ] && [ "${NODETOOL_MIGRATE_ON_BOOT:-1}" != "0" ]; then' \
    '  echo "Applying database migrations..."' \
    '  node /app/backend/db-migrate.mjs' \
    'fi' \
    'exec "$@"' \
    > /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

EXPOSE 7777

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -fsk https://localhost:7777/health \
     || curl -fs   http://localhost:7777/health \
     || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "backend/server.mjs"]
