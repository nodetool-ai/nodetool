#!/usr/bin/env bash
#
# SessionStart hook — makes a fresh Claude Code (web) container ready to run the
# server, typecheck, lint, and test with no manual setup.
#
# Installs npm dependencies using the flags that survive sandboxed/proxied
# environments (see CLAUDE.md § Common Pitfalls). Idempotent: exits fast when the
# dependency tree is already there. Runs only in the remote (web) environment so
# local terminal sessions start instantly.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT"

log() { echo "[session-start] $*"; }

if [ -d node_modules/.package-lock.json ] || [ -f node_modules/.package-lock.json ]; then
  log "dependencies already installed"
  exit 0
fi

# keytar compiles against libsecret. Without the headers npm rolls the whole
# node_modules tree back. Only attempted when we can install without prompting;
# failure is non-fatal because --ignore-scripts below still yields a usable tree.
if ! dpkg -s libsecret-1-dev >/dev/null 2>&1 && [ "$(id -u)" = "0" ] && command -v apt-get >/dev/null 2>&1; then
  log "installing libsecret-1-dev (keytar build dependency)"
  apt-get update -y >/dev/null 2>&1 || true
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libsecret-1-dev >/dev/null 2>&1 \
    || log "libsecret-1-dev unavailable — continuing"
fi

# Electron and onnxruntime download binaries in postinstall; proxies 403 those,
# and any postinstall failure rolls back the entire install.
export ELECTRON_SKIP_BINARY_DOWNLOAD=1
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
export npm_config_onnxruntime_node_install_cuda=skip

log "installing npm dependencies (first run is slow; the container caches it)"
if ! npm install --prefer-offline --no-audit --fund=false; then
  log "install with scripts failed — retrying with --ignore-scripts"
  log "(lint/typecheck/tests still work; 'npm run rebuild:native' fixes SQLite)"
  npm install --prefer-offline --no-audit --fund=false --ignore-scripts
fi

# Generate .env + SECRETS_MASTER_KEY. Headless containers have no system
# keychain, and without the key the server aborts during startup.
node scripts/ensure-dev-env.mjs || log "could not prepare .env — run 'node scripts/ensure-dev-env.mjs'"

log "ready — ./start.sh serves the API on http://localhost:7777"
