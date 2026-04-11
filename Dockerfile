FROM node:20-slim

# System deps for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip \
    build-essential curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better layer caching
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
COPY packages/fal-nodes/package.json packages/fal-nodes/
COPY packages/replicate-nodes/package.json packages/replicate-nodes/
COPY packages/elevenlabs-nodes/package.json packages/elevenlabs-nodes/
COPY packages/agents/package.json packages/agents/
COPY packages/base-nodes/package.json packages/base-nodes/
COPY packages/dsl/package.json packages/dsl/
COPY packages/chat/package.json packages/chat/
COPY packages/websocket/package.json packages/websocket/
COPY packages/cli/package.json packages/cli/
COPY packages/deploy/package.json packages/deploy/

# Install deps
RUN npm ci 2>/dev/null || npm install

# Copy source and build
COPY packages/ packages/
COPY scripts/ scripts/
COPY tsconfig*.json ./

RUN npm run build:packages

# Create dir for web dist (mounted at runtime via -v)
RUN mkdir -p /app/web/dist

EXPOSE 7777

# Health check supports both TLS and plain HTTP
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -fsk https://localhost:7777/health 2>/dev/null || curl -f http://localhost:7777/health 2>/dev/null || exit 1

CMD ["node", "packages/websocket/dist/server.js"]
