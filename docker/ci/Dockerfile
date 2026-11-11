# syntax=docker/dockerfile:1
#
# The Linux image the Node and TypeScript CI jobs run in. It carries every
# system package those jobs used to apt-get install at run time, so no job
# runs apt. See README.md beside this file for the tag scheme and how to
# change the package list.

ARG PLAYWRIGHT_VERSION=1.60.0

FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS node

FROM ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852

ARG PLAYWRIGHT_VERSION
ARG DEBIAN_FRONTEND=noninteractive

# Tools the jobs call directly (git, gh, jq, pipx, gdb, zstd for actions/cache),
# the compiler toolchain node-gyp needs to rebuild native modules, and the
# libraries the test suites load:
#   libsecret-1-0 / -dev  keytar
#   mesa-vulkan-drivers   lavapipe, the CPU Vulkan ICD Dawn uses for WebGPU
#   libgl1 ... libxxf86vm1  the headless GL stack the node packages' suites load
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg git openssh-client sudo \
      jq zstd xz-utils unzip zip file rsync procps psmisc lsof \
      build-essential python3 python3-venv pipx \
      gdb xvfb xauth fontconfig fonts-dejavu-core vulkan-tools \
      libsecret-1-0 libsecret-1-dev \
      mesa-vulkan-drivers libgl1 libegl1 libsm6 libxi6 libxrender1 libxfixes3 \
      libxkbcommon0 libxxf86vm1 gh \
 && rm -rf /var/lib/apt/lists/*

# Chromium's and WebKit's shared libraries and fonts, as `playwright install
# --with-deps` installed them (marketing/ tests WebKit too). The browsers
# themselves still download per job (`npx playwright install chromium`), so
# they always match the Playwright version the job's lockfile pins.
# Node is only needed for this step: jobs get theirs from actions/setup-node.
COPY --from=node /usr/local/bin/node /tmp/node/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /tmp/node/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npx-cli.js /tmp/node/bin/npx \
 && PATH=/tmp/node/bin:$PATH npx -y "playwright@${PLAYWRIGHT_VERSION}" install-deps chromium webkit \
 && rm -rf /tmp/node /root/.npm /var/lib/apt/lists/*

# The hosted runner's user is uid 1001, which owns the mounted workspace, tool
# cache and home. Jobs run as that user (container option --user 1001) so
# Chromium can keep its sandbox, which refuses to start as root. sudo stays
# available as it is on the runner.
RUN groupadd --gid 1001 runner \
 && useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash runner \
 && echo "runner ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/runner \
 && chmod 0440 /etc/sudoers.d/runner

# Steps can tell they run in this image.
ENV NODETOOL_CI_IMAGE=1

LABEL org.opencontainers.image.source="https://github.com/nodetool-ai/nodetool" \
      org.opencontainers.image.description="NodeTool CI image: system packages for the Linux Node and TypeScript jobs"
