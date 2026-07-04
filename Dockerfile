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

FROM deps AS prod-deps
RUN rm -rf node_modules \
    && npm ci --omit=dev --workspace=@nodetool-ai/websocket --include-workspace-root=false \
    && npm cache clean --force

FROM deps AS build

COPY packages/ packages/
COPY scripts/ scripts/
COPY tsconfig*.json ./
COPY turbo.json ./

RUN npm run build:packages

# Bundle template workflows + gallery thumbnails next to the server entry so
# Docker/Electron-style installs resolve examples without extra volume mounts.
RUN set -eu; \
    examples_src="packages/base-nodes/nodetool/examples/nodetool-base"; \
    assets_src="packages/base-nodes/nodetool/assets/nodetool-base"; \
    examples_dest="packages/websocket/dist/examples/nodetool-base"; \
    assets_dest="packages/websocket/dist/assets/nodetool-base"; \
    mkdir -p "$examples_dest" "$assets_dest"; \
    if [ -d "$examples_src" ]; then \
      cp -a "$examples_src/." "$examples_dest/"; \
    else \
      echo "Warning: template examples not found at $examples_src"; \
    fi; \
    if [ -d "$assets_src" ]; then \
      cp -a "$assets_src/." "$assets_dest/"; \
    else \
      echo "Warning: template thumbnails not found at $assets_src"; \
    fi

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
RUN cd web && NODE_OPTIONS="$WEB_BUILD_NODE_OPTIONS" npm run build

# Assemble a minimal runtime filesystem with compiled packages, web assets, and
# bundled workflow examples/thumbnails.
RUN mkdir -p /runtime/packages /runtime/web \
    && cp package.json package-lock.json /runtime/ \
    && for pkg in packages/*; do \
         if [ -d "$pkg/dist" ]; then \
           mkdir -p "/runtime/$pkg"; \
           cp "$pkg/package.json" "/runtime/$pkg/package.json"; \
           cp -a "$pkg/dist" "/runtime/$pkg/dist"; \
         fi; \
       done \
    && mkdir -p /runtime/packages/base-nodes/nodetool \
    && if [ -d packages/base-nodes/nodetool/examples ]; then \
         cp -a packages/base-nodes/nodetool/examples /runtime/packages/base-nodes/nodetool/examples; \
       fi \
    && if [ -d packages/base-nodes/nodetool/assets ]; then \
         cp -a packages/base-nodes/nodetool/assets /runtime/packages/base-nodes/nodetool/assets; \
       fi \
    && cp web/package.json /runtime/web/package.json \
    && cp -a web/dist /runtime/web/dist

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
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /workspace \
    && chown node:node /workspace

WORKDIR /app

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /runtime/ ./

# Startup migration runner (Postgres). Depends only on @nodetool-ai/models +
# postgres, both already present above — no CLI bundle needed.
COPY --chown=node:node scripts/db-migrate.mjs ./scripts/db-migrate.mjs

# If neither a master key nor AWS Secrets Manager is configured, persist a
# generated 32-byte base64 key next to the SQLite database so encrypted secrets
# survive restarts when /workspace is mounted as a volume. For production, pass
# -e SECRETS_MASTER_KEY=$(openssl rand -base64 32) or configure AWS.
RUN printf '%s\n' \
    '#!/bin/sh' \
    'set -eu' \
    'if [ -z "${DATABASE_URL:-}" ] && [ -z "${DB_PATH:-}" ]; then' \
    '  echo "ERROR: No database configured. Set DATABASE_URL (PostgreSQL) or DB_PATH (SQLite)." >&2' \
    '  exit 1' \
    'fi' \
    'KEY_FILE="${SECRETS_MASTER_KEY_FILE:-/workspace/.secrets_master_key}"' \
    'if [ -z "${SECRETS_MASTER_KEY:-}" ] && [ -z "${AWS_SECRETS_MASTER_KEY_NAME:-}" ]; then' \
    '  mkdir -p "$(dirname "$KEY_FILE")"' \
    '  if [ ! -s "$KEY_FILE" ]; then' \
    '    umask 077' \
    '    node -e "process.stdout.write(require(\"crypto\").randomBytes(32).toString(\"base64\"))" > "$KEY_FILE"' \
    '  fi' \
    '  export SECRETS_MASTER_KEY="$(cat "$KEY_FILE")"' \
    'fi' \
    'if [ -n "${DATABASE_URL:-}" ]; then' \
    '  echo "Applying database migrations..."' \
    '  node /app/scripts/db-migrate.mjs' \
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
CMD ["node", "packages/websocket/dist/server.js"]
