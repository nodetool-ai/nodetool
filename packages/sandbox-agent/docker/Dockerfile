# ------------------------------------------------------------------------------
# nodetool/sandbox-agent — isolated agent computer
#
# Ubuntu 22.04 + Node 24 + Chromium + Xvfb/fluxbox + x11vnc + websockify.
# The in-container tool server (@nodetool/sandbox-agent) listens on :7788
# and exposes file/shell/browser/desktop tools over HTTP.
# ------------------------------------------------------------------------------

FROM node:24-bookworm-slim AS base

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    NODETOOL_TOOL_PORT=7788 \
    NODETOOL_VNC_PORT=6080

# System packages. One big apt install to minimize layers.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git sudo tmux \
      python3 python3-pip python3-venv \
      xvfb fluxbox x11vnc websockify novnc \
      xdotool scrot imagemagick tesseract-ocr \
      ffmpeg pandoc weasyprint \
      chromium fonts-liberation fonts-noto-color-emoji \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libpango-1.0-0 libcairo2 libasound2 \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for the agent's workload. Passwordless sudo is NOT granted;
# sudo-gated tools should fail unless the operator explicitly enables it.
RUN useradd -m -s /bin/bash -u 1000 ubuntu \
    && mkdir -p /workspace \
    && chown ubuntu:ubuntu /workspace

# -----------------------------------------------------------------------------
# Build stage: compile @nodetool/sandbox-agent and its deps.
# -----------------------------------------------------------------------------
FROM base AS build
WORKDIR /build
# The build context should be the repo root (docker build -f packages/sandbox-agent/docker/Dockerfile .)
COPY package.json package-lock.json ./
COPY tsconfig.build.json ./
COPY scripts/ ./scripts/
COPY packages/config ./packages/config
COPY packages/sandbox ./packages/sandbox
COPY packages/sandbox-agent ./packages/sandbox-agent

# Install workspace deps (scoped to what sandbox-agent needs).
RUN npm install --workspaces=false --include-workspace-root=true \
    && npm install -w @nodetool/config -w @nodetool/sandbox -w @nodetool/sandbox-agent

RUN npx tsc --build \
      packages/config \
      packages/sandbox \
      packages/sandbox-agent

# -----------------------------------------------------------------------------
# Runtime stage.
# -----------------------------------------------------------------------------
FROM base AS runtime
WORKDIR /opt/sandbox-agent

# Copy built JS and production node_modules for the agent.
COPY --from=build /build/packages/config/dist ./node_modules/@nodetool/config/dist
COPY --from=build /build/packages/config/package.json ./node_modules/@nodetool/config/package.json
COPY --from=build /build/packages/sandbox/dist ./node_modules/@nodetool/sandbox/dist
COPY --from=build /build/packages/sandbox/package.json ./node_modules/@nodetool/sandbox/package.json
COPY --from=build /build/packages/sandbox-agent/dist ./dist
COPY --from=build /build/packages/sandbox-agent/package.json ./package.json
COPY --from=build /build/node_modules ./vendor_modules

# Merge vendor modules (fastify, zod, etc.) into local node_modules, skipping
# the @nodetool/* packages we've already laid down.
RUN set -eux; \
    for d in vendor_modules/*; do \
      name=$(basename "$d"); \
      case "$name" in \
        @nodetool) cp -rn "$d"/* ./node_modules/@nodetool/ 2>/dev/null || true ;; \
        *) cp -rn "$d" ./node_modules/ 2>/dev/null || true ;; \
      esac; \
    done; \
    rm -rf vendor_modules

COPY packages/sandbox-agent/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
# Install Playwright's own Chromium build under a shared dir so the ubuntu
# user can launch it. The distro chromium is left in place for apps that
# shell out to `chromium` directly.
RUN npx --yes playwright@1.49.0 install chromium \
    && chown -R ubuntu:ubuntu /opt/pw-browsers

USER ubuntu
WORKDIR /home/ubuntu

EXPOSE 7788 6080
ENTRYPOINT ["/entrypoint.sh"]
