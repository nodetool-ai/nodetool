# syntax=docker/dockerfile:1

FROM node:24-slim AS deps

# Native build dependencies are only needed while installing/building packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip \
    build-essential pkg-config \
    ca-certificates \
    libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests first for better dependency-layer caching.
COPY package.json package-lock.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/config/package.json packages/config/
COPY packages/security/package.json packages/security/
COPY packages/huggingface/package.json packages/huggingface/
COPY packages/vectorstore/package.json packages/vectorstore/
COPY packages/auth/package.json packages/auth/
COPY packages/storage/package.json packages/storage/
COPY packages/runtime/package.json packages/runtime/
COPY packages/kernel/package.json packages/kernel/
COPY packages/node-sdk/package.json packages/node-sdk/
COPY packages/models/package.json packages/models/
COPY packages/code-runners/package.json packages/code-runners/
COPY packages/fal-codegen/package.json packages/fal-codegen/
COPY packages/fal-nodes/package.json packages/fal-nodes/
COPY packages/replicate-codegen/package.json packages/replicate-codegen/
COPY packages/replicate-nodes/package.json packages/replicate-nodes/
COPY packages/elevenlabs-nodes/package.json packages/elevenlabs-nodes/
COPY packages/kie-codegen/package.json packages/kie-codegen/
COPY packages/kie-nodes/package.json packages/kie-nodes/
COPY packages/agents/package.json packages/agents/
COPY packages/base-nodes/package.json packages/base-nodes/
COPY packages/dsl/package.json packages/dsl/
COPY packages/chat/package.json packages/chat/
COPY packages/websocket/package.json packages/websocket/
COPY packages/cli/package.json packages/cli/
COPY packages/deploy/package.json packages/deploy/
COPY packages/sandbox/package.json packages/sandbox/
COPY packages/sandbox-agent/package.json packages/sandbox-agent/
COPY packages/sandbox-tools/package.json packages/sandbox-tools/
COPY web/package.json web/

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

COPY web/ web/
ARG WEB_BUILD_NODE_OPTIONS=--max-old-space-size=4096
RUN cd web && NODE_OPTIONS="$WEB_BUILD_NODE_OPTIONS" npm run build

# Assemble a minimal runtime filesystem with compiled packages and web assets.
RUN mkdir -p /runtime/packages /runtime/web \
    && cp package.json package-lock.json /runtime/ \
    && for pkg in packages/*; do \
         if [ -d "$pkg/dist" ]; then \
           mkdir -p "/runtime/$pkg"; \
           cp "$pkg/package.json" "/runtime/$pkg/package.json"; \
           cp -a "$pkg/dist" "/runtime/$pkg/dist"; \
         fi; \
       done \
    && cp web/package.json /runtime/web/package.json \
    && cp -a web/dist /runtime/web/dist

FROM node:24-slim AS runtime

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
    'exec "$@"' \
    > /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh

USER node

EXPOSE 7777

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -f http://localhost:7777/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "packages/websocket/dist/server.js"]
