#!/bin/bash
# Fast, idempotent setup for coding agents and fresh dev containers.
#
# Assumes Node.js is already installed (Claude Code on the web, Codex, and most
# CI/dev containers ship it). Unlike scripts/setup-codex.sh — which installs a
# full toolchain (apt + nvm/Node + a Python worker env) and compiles every
# workspace — this does only what's needed before you can typecheck, lint, test,
# and run the dev servers:
#
#   1. ensure the one OS lib native builds need (libsecret-1-dev, for keytar)
#   2. npm install    (root workspaces: packages, web, electron) — skipped if warm
#   3. build:packages (decorator packages load from dist/, so this is required)
#
# It's idempotent and non-interactive. Crucially, it SKIPS the npm install when
# node_modules is already up to date with package-lock.json: reinstalling on a
# warm tree needlessly re-triggers native rebuilds (better-sqlite3, keytar) that
# are slow and can fail on a flaky network. Skipping keeps re-runs to seconds and
# makes the script safe to call from a SessionStart hook every session.
#
# Usage:
#   bash scripts/agent-setup.sh
#
# Environment variables:
#   FORCE_INSTALL=1  Run npm install even if node_modules looks up to date
#   SKIP_BUILD=1     Install dependencies only; do not run build:packages
#   SKIP_MOBILE=1    Do not install the (separate) mobile npm project
#   SKIP_APT=1       Do not attempt the libsecret-1-dev apt install
#   VERBOSE=1        Stream full npm/turbo output instead of silencing it

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -t 1 ]]; then
  BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
else
  BOLD=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi
step() { echo -e "\n${BLUE}${BOLD}==> $*${NC}"; }
ok() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }

if ! command -v node >/dev/null 2>&1; then
  echo "node not found. This script assumes Node.js is already installed." >&2
  echo "For a full bootstrap (apt + nvm + Python) use: bash scripts/setup-codex.sh" >&2
  exit 1
fi

# NODE_ENV=production makes npm omit devDependencies (typescript, turbo,
# node-gyp) and the build then dies with misleading "module not found" errors.
if [[ "${NODE_ENV:-}" == "production" ]]; then
  warn "NODE_ENV=production drops devDependencies; unsetting it for this run."
  unset NODE_ENV
fi

step "Node $(node --version) / npm $(npm --version)"
PINNED="$(tr -d '[:space:]' < .nvmrc 2>/dev/null || true)"
if [[ -n "${PINNED}" && "$(node --version | sed 's/^v//' | cut -d. -f1)" != "${PINNED%%.*}" ]]; then
  warn "Node major differs from .nvmrc (${PINNED}). Usually fine for editing; run 'nvm use' for parity with the packaged app."
fi

# keytar (used by packages/security) builds from source when no prebuilt binary
# is fetched, and that build needs libsecret-1-dev. Install it once if it's
# missing so any native rebuild has what it needs. Non-fatal — a warm tree with
# prebuilt binaries doesn't need it.
if [[ "${SKIP_APT:-0}" != "1" ]] && ! pkg-config --exists libsecret-1 2>/dev/null; then
  if command -v apt-get >/dev/null 2>&1; then
    step "Installing libsecret-1-dev (needed for keytar native build)"
    SUDO=""; [[ "$(id -u)" != "0" ]] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"
    if ${SUDO} apt-get install -y --no-install-recommends libsecret-1-dev >/dev/null 2>&1; then
      ok "libsecret-1-dev installed"
    else
      warn "Could not install libsecret-1-dev; keytar source builds may fail (prebuilt binaries still work)."
    fi
  fi
fi

# Avoid optional network fetches that flake in sandboxed containers. CPU
# binaries stay usable; only GPU/CUDA extras and browser/electron binaries are
# skipped (Chromium is pre-provisioned in the web env; e2e installs it itself).
export ELECTRON_SKIP_BINARY_DOWNLOAD="${ELECTRON_SKIP_BINARY_DOWNLOAD:-1}"
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD="${PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:-1}"
export npm_config_onnxruntime_node_install_cuda="${npm_config_onnxruntime_node_install_cuda:-skip}"

NPM_FLAGS=(--prefer-offline --no-audit --fund=false)
run() { if [[ "${VERBOSE:-0}" == "1" ]]; then "$@"; else "$@" >/dev/null; fi; }

# node_modules is up to date when npm's own install marker exists and is not
# older than the lockfile. When it is, reinstalling only wastes time and risks
# re-running native builds, so skip it.
root_install_fresh() {
  [[ -f node_modules/.package-lock.json ]] || return 1
  [[ package-lock.json -nt node_modules/.package-lock.json ]] && return 1
  return 0
}

if [[ "${FORCE_INSTALL:-0}" != "1" ]] && root_install_fresh; then
  ok "Dependencies already up to date (node_modules matches package-lock.json). Skipping npm install."
else
  step "Installing JavaScript dependencies (npm install)"
  run npm install "${NPM_FLAGS[@]}"
  ok "root workspaces installed (packages, web, electron)"
fi

# mobile/ is intentionally a separate npm project (its Expo/RN tree must not be
# hoisted), so it needs its own install.
if [[ "${SKIP_MOBILE:-0}" != "1" && -f mobile/package.json ]]; then
  if [[ "${FORCE_INSTALL:-0}" != "1" && -d mobile/node_modules ]]; then
    ok "mobile dependencies already installed. Skipping."
  else
    step "Installing mobile dependencies"
    run npm --prefix mobile install "${NPM_FLAGS[@]}" || warn "mobile install failed; mobile typecheck/tests unavailable, continuing."
  fi
fi

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  step "Building backend packages (npm run build:packages)"
  # Required: base-nodes, node-sdk, fal-nodes, replicate-nodes, elevenlabs-nodes
  # use decorators and load from dist/. Turbo caches this, so re-runs are cheap.
  run npm run build:packages
  ok "packages built"
else
  warn "SKIP_BUILD=1 — packages not built. 'npm run dev' and package tests need 'npm run build:packages'."
fi

echo ""
ok "Ready. Common next steps:"
echo "  npm run check        # typecheck + lint + tests (full gate)"
echo "  npm run typecheck    # type check web, electron, mobile"
echo "  npm run lint         # lint all packages"
echo "  npm run test         # web + electron + mobile tests"
echo "  npm run dev          # backend + web dev servers"
