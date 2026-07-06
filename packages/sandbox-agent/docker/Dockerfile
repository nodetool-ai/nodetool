# ------------------------------------------------------------------------------
# nodetool/sandbox-agent — isolated agent computer
#
# Debian Bookworm (via node:22-bookworm-slim) + Node 22 + Chromium +
# Xvfb/fluxbox + x11vnc + websockify.
# The in-container tool server (@nodetool-ai/sandbox-agent) listens on :7788
# and exposes file/shell/browser/desktop tools over HTTP.
# ------------------------------------------------------------------------------

FROM node:22-bookworm-slim AS base

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    NODETOOL_TOOL_PORT=7788 \
    NODETOOL_VNC_PORT=6080

# System packages. One big apt install to minimize layers.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget git sudo tmux jq zip unzip \
      python3 python3-pip python3-venv \
      xvfb fluxbox x11vnc websockify novnc xterm \
      xdotool scrot imagemagick tesseract-ocr \
      ffmpeg pandoc weasyprint \
      poppler-utils qpdf postgresql-client \
      chromium fonts-liberation fonts-noto-color-emoji \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libpango-1.0-0 libcairo2 libasound2 \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python tool venv on PATH: yt-dlp for media downloads plus the PDF stack the
# PDF agents reference. A venv sidesteps Debian's PEP 668 pip lockout.
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir \
       yt-dlp pypdf pdfplumber pypdfium2 reportlab \
    && rm -rf /root/.cache
ENV PATH="/opt/venv/bin:$PATH"

# JS document libraries agents import from ad-hoc Node scripts, preinstalled
# globally so require('pdf-lib') works without a per-run npm install.
RUN npm install -g pdf-lib docx && npm cache clean --force
ENV NODE_PATH=/usr/local/lib/node_modules

# Non-root user for the agent's workload. Passwordless sudo is NOT granted;
# sudo-gated tools should fail unless the operator explicitly enables it.
RUN userdel node 2>/dev/null || true \
    && useradd -m -s /bin/bash -u 1000 ubuntu \
    && mkdir -p /workspace \
    && chown ubuntu:ubuntu /workspace

# -----------------------------------------------------------------------------
# Build stage: compile @nodetool-ai/sandbox-agent and its deps.
# -----------------------------------------------------------------------------
FROM base AS build
WORKDIR /build
# The build context should be the repo root (docker build -f packages/sandbox-agent/docker/Dockerfile .)
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY tsconfig.build.json ./
COPY scripts/ ./scripts/
COPY packages/config ./packages/config
COPY packages/sandbox ./packages/sandbox
COPY packages/sandbox-agent ./packages/sandbox-agent

# Install workspace deps (scoped to what sandbox-agent needs).
RUN npm install --workspaces=false --include-workspace-root=true \
    && npm install -w @nodetool-ai/config -w @nodetool-ai/sandbox -w @nodetool-ai/sandbox-agent

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
COPY --from=build /build/packages/config/dist ./node_modules/@nodetool-ai/config/dist
COPY --from=build /build/packages/config/package.json ./node_modules/@nodetool-ai/config/package.json
COPY --from=build /build/packages/sandbox/dist ./node_modules/@nodetool-ai/sandbox/dist
COPY --from=build /build/packages/sandbox/package.json ./node_modules/@nodetool-ai/sandbox/package.json
COPY --from=build /build/packages/sandbox-agent/dist ./dist
COPY --from=build /build/packages/sandbox-agent/package.json ./package.json
COPY --from=build /build/node_modules ./vendor_modules

# Merge vendor modules (fastify, zod, etc.) into local node_modules, skipping
# the @nodetool-ai/* packages we've already laid down.
RUN set -eux; \
    for d in vendor_modules/*; do \
      name=$(basename "$d"); \
      case "$name" in \
        @nodetool-ai) cp -rn "$d"/* ./node_modules/@nodetool-ai/ 2>/dev/null || true ;; \
        *) cp -rn "$d" ./node_modules/ 2>/dev/null || true ;; \
      esac; \
    done; \
    rm -rf vendor_modules

COPY packages/sandbox-agent/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# chrome-launcher locates the system Chromium installed via apt.
ENV CHROME_PATH=/usr/bin/chromium

USER ubuntu
WORKDIR /home/ubuntu

EXPOSE 7788 6080
ENTRYPOINT ["/entrypoint.sh"]
