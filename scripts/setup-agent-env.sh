#!/usr/bin/env bash
#
# Prepares a fresh agent container (Claude Code on the web, Codex, or any
# sandboxed/proxied checkout) to run the server, typecheck, lint, and test.
#
# Installs npm dependencies with the flags that survive sandboxed/proxied
# environments (see AGENTS.md § Prerequisites) and creates .env with a
# SECRETS_MASTER_KEY. Idempotent: exits fast when the dependency tree is
# already there. Skips Electron's binary download, so a desktop developer who
# needs `npm run electron:dev` should run plain `npm install` instead.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { echo "[setup] $*"; }

# A cached container or an old checkout can predate a workspace added to
# package.json. Its tree exists but lacks that workspace's link, and every build
# that imports it fails.
missing_workspace_links() {
  node -e '
    const fs = require("fs");
    for (const w of require("./package.json").workspaces) {
      let name;
      try { name = JSON.parse(fs.readFileSync(w + "/package.json", "utf8")).name; } catch { continue; }
      if (!fs.existsSync("node_modules/" + name)) { console.log(w); }
    }'
}

needs_install() {
  if [ ! -f node_modules/.package-lock.json ]; then
    return 0
  fi
  missing="$(missing_workspace_links)"
  if [ -z "$missing" ]; then
    return 1
  fi
  log "unlinked workspaces: $(echo $missing) — reinstalling to link them"
}

install_dependencies() {
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
}

if needs_install; then
  install_dependencies
else
  log "dependencies already installed"
fi

# Generate .env + SECRETS_MASTER_KEY. Headless containers have no system
# keychain, and without the key the server aborts during startup.
node scripts/ensure-dev-env.mjs || log "could not prepare .env — run 'node scripts/ensure-dev-env.mjs'"

log "ready — ./start.sh serves the API on http://localhost:7777"
