#!/usr/bin/env bash
# Complete Codex/bootstrap setup for NodeTool development.
#
# This script is intentionally idempotent and suitable for OpenAI Codex or a
# fresh Linux dev container. It installs OS build dependencies, ensures Node.js
# 24.x, installs all npm dependencies, optionally prepares local Python node
# packages, and compiles the repository.
#
# Usage:
#   bash scripts/setup-codex.sh
#
# Environment variables:
#   SKIP_APT=1          Do not install apt packages
#   SKIP_PYTHON=1       Do not create/install Python worker environment
#   SKIP_BUILD=1        Install dependencies only; do not compile
#   SKIP_PLAYWRIGHT=1   Do not install Playwright browser/deps
#   PYTHON_ENV=.venv    Python virtualenv path (default: .venv)
#   NODE_VERSION=24     Node major/version to install/use (default: 24)
#   CI=1                Non-interactive npm install behavior

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_ENV="${PYTHON_ENV:-${ROOT_DIR}/.venv}"
NODE_VERSION="${NODE_VERSION:-$(tr -d '[:space:]' < "${ROOT_DIR}/.nvmrc" 2>/dev/null || printf '24')}"

if [[ -t 1 ]]; then
  BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'
else
  BOLD=''; GREEN=''; YELLOW=''; BLUE=''; RED=''; NC=''
fi

step() { echo -e "\n${BLUE}${BOLD}==> $*${NC}"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

cd "${ROOT_DIR}"

step "Installing Linux build dependencies"
if [[ "${SKIP_APT:-0}" != "1" ]]; then
  if have apt-get; then
    sudo apt-get update
    apt_packages=(
      build-essential
      ca-certificates
      curl
      git
      pkg-config
      python3
      python3-dev
      python3-pip
      python3-venv
      libsecret-1-dev
      libnss3
      libatk-bridge2.0-0
      libgtk-3-0
      libgbm1
      libxss1
      libxtst6
      libdrm2
      libxkbcommon0
      ffmpeg
      pandoc
    )

    # Ubuntu 24.04 renamed libasound2 to libasound2t64. Older images still use
    # libasound2, so select whichever package exists in the current container.
    if apt-cache show libasound2t64 >/dev/null 2>&1; then
      apt_packages+=(libasound2t64)
    else
      apt_packages+=(libasound2)
    fi

    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${apt_packages[@]}"
  else
    warn "apt-get not found; assuming OS dependencies are already installed"
  fi
else
  warn "Skipping apt package installation"
fi

step "Ensuring Node.js ${NODE_VERSION}"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "${NVM_DIR}/nvm.sh"
else
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  # shellcheck source=/dev/null
  . "${NVM_DIR}/nvm.sh"
fi
nvm install "${NODE_VERSION}"
nvm use "${NODE_VERSION}"
node --version
npm --version

step "Installing JavaScript dependencies"
npm config set audit false
npm config set fund false
npm config set prefer-offline true
# @huggingface/transformers pulls in onnxruntime-node. Its install script tries
# to download optional CUDA binaries from GitHub on Linux, which often fails in
# sandboxed/Codex containers without outbound GitHub access. CPU binaries remain
# usable when CUDA installation is skipped.
npm config set onnxruntime-node-install-cuda skip
export npm_config_onnxruntime_node_install_cuda="${npm_config_onnxruntime_node_install_cuda:-skip}"
export ELECTRON_SKIP_BINARY_DOWNLOAD="${ELECTRON_SKIP_BINARY_DOWNLOAD:-1}"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-1}"
if [[ -f package-lock.json ]]; then
  npm ci --prefer-offline --no-audit --fund=false
else
  npm install --prefer-offline --no-audit --fund=false
fi

# The mobile app is kept as a separate npm project in this repo.
if [[ -f mobile/package.json ]]; then
  step "Installing mobile dependencies"
  if [[ -f mobile/package-lock.json ]]; then
    npm --prefix mobile ci --prefer-offline --no-audit --fund=false
  else
    npm --prefix mobile install --prefer-offline --no-audit --fund=false
  fi
fi

if [[ "${SKIP_PLAYWRIGHT:-0}" != "1" && -f web/package.json ]]; then
  step "Installing Playwright Chromium dependencies"
  npx playwright install --with-deps chromium || warn "Playwright install failed; continuing because it is only required for e2e tests"
fi

if [[ "${SKIP_PYTHON:-0}" != "1" ]]; then
  step "Preparing Python worker environment"
  python3 -m venv "${PYTHON_ENV}"
  # shellcheck source=/dev/null
  . "${PYTHON_ENV}/bin/activate"
  python -m pip install --upgrade pip setuptools wheel

  # Install editable sibling Python node packages when checked out next to this repo.
  WORKSPACE_DIR="$(dirname "${ROOT_DIR}")"
  for pkg in nodetool-core nodetool-huggingface nodetool-mlx nodetool-apple; do
    if [[ -f "${WORKSPACE_DIR}/${pkg}/pyproject.toml" || -f "${WORKSPACE_DIR}/${pkg}/setup.py" ]]; then
      python -m pip install -e "${WORKSPACE_DIR}/${pkg}"
    fi
  done

  # If no sibling checkout exists, install the core worker packages from the NodeTool registry.
  if ! python -c 'import nodetool' >/dev/null 2>&1; then
    python -m pip install \
      --extra-index-url https://nodetool-ai.github.io/nodetool-registry/simple/ \
      nodetool-core nodetool-base
  fi
fi

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  step "Compiling backend packages"
  npm run build:packages

  step "Compiling web app"
  npm run build:web

  step "Compiling Electron app"
  npm run build:electron

  step "Type-checking all projects"
  npm run typecheck
fi

success "Codex environment is ready for editing and compiling NodeTool."
echo ""
echo "Useful commands:"
echo "  npm run dev             # backend + web dev servers"
echo "  npm run dev:server      # backend only"
echo "  npm run dev:web         # web only"
echo "  npm run build           # compile all workspaces"
echo "  npm run check           # typecheck + lint + tests"
if [[ "${SKIP_PYTHON:-0}" != "1" ]]; then
  echo "  source '${PYTHON_ENV}/bin/activate'  # activate Python worker env"
fi
