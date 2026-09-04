#!/usr/bin/env bash
#
# One command to get NodeTool running.
#
#   ./start.sh            backend API on :7777 (hot-reloads TypeScript source)
#   ./start.sh full       backend + web UI on :3000
#   ./start.sh web        web UI only
#   ./start.sh check      typecheck + lint + tests
#   ./start.sh doctor     report environment state without starting anything
#
# Everything it needs — dependencies, native module, package build — is set up
# on first run and skipped on every run after. Override the port with PORT=8080.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [ -t 1 ]; then
  B='\033[1m'; G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; N='\033[0m'
else
  B=''; G=''; Y=''; R=''; N=''
fi
step() { echo -e "\n${B}==>${N} $*"; }
ok()   { echo -e "${G}ok${N}   $*"; }
warn() { echo -e "${Y}warn${N} $*"; }
die()  { echo -e "${R}error${N} $*" >&2; exit 1; }

MODE="${1:-server}"
case "$MODE" in
  server|full|web|check|doctor) ;;
  *) die "Unknown mode '${MODE}'. Use: server | full | web | check | doctor" ;;
esac

# ── Node version ────────────────────────────────────────────────────────────
WANT_NODE="$(tr -d '[:space:]' < .nvmrc 2>/dev/null || echo 22)"
command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node ${WANT_NODE} (https://nodejs.org) or run 'nvm install'."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" != "22" ]; then
  # Try to switch automatically before giving up.
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm use >/dev/null 2>&1 || nvm install "$WANT_NODE" >/dev/null 2>&1 || true
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  fi
  [ "$NODE_MAJOR" = "22" ] || die "Node 22.x required (found $(node -v)). Run 'nvm use' — it reads .nvmrc."
fi

# ── Doctor: report only, change nothing ─────────────────────────────────────
if [ "$MODE" = "doctor" ]; then
  PORT="${PORT:-7777}"
  step "Environment"
  echo "  node            $(node -v)"
  echo "  npm             $(npm -v)"
  echo "  .env            $([ -f .env ] && echo present || echo 'missing — created on next run')"
  echo "  node_modules    $([ -d node_modules ] && echo present || echo 'missing — installed on next run')"
  echo "  packages built  $([ -d packages/base-nodes/dist ] && echo yes || echo 'no — built on next run')"
  echo "  better-sqlite3  $([ -d node_modules/better-sqlite3/build ] && echo built || echo 'not built')"
  BLENDER_BIN="${BLENDER_PATH:-}"
  if [ -z "$BLENDER_BIN" ]; then
    BLENDER_BIN="$(command -v blender 2>/dev/null || true)"
  fi
  if [ -z "$BLENDER_BIN" ] && [ -x "/Applications/Blender.app/Contents/MacOS/Blender" ]; then
    BLENDER_BIN="/Applications/Blender.app/Contents/MacOS/Blender"
  fi
  if [ -n "$BLENDER_BIN" ]; then
    echo "  blender       $("$BLENDER_BIN" --version 2>/dev/null | head -1 || echo 'present (version unknown)')"
  else
    echo "  blender       not found — nodetool.blender nodes need Blender 5.2+ (set BLENDER_PATH)"
  fi
  if node -e "process.exit(0)" 2>/dev/null; then
    PORT_STATE=$(node -e "
      const net = require('net');
      const s = net.createConnection({ host: '127.0.0.1', port: ${PORT} });
      s.setTimeout(1000);
      const done = (v) => { console.log(v); s.destroy(); process.exit(0); };
      s.on('connect', () => done('in use'));
      s.on('timeout', () => done('free'));
      s.on('error', () => done('free'));
    ")
    echo "  port ${PORT}      ${PORT_STATE}"
  fi
  exit 0
fi

# ── Environment file ────────────────────────────────────────────────────────
# Creates .env and generates SECRETS_MASTER_KEY so the server never has to reach
# for a system keychain that headless Linux containers do not have.
node scripts/ensure-dev-env.mjs

# ── Dependencies ────────────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  step "Installing dependencies (a few minutes, only the first time)"
  # Postinstall binary downloads 403 behind proxies, and any postinstall failure
  # rolls back the whole tree — skip the ones dev never needs.
  export ELECTRON_SKIP_BINARY_DOWNLOAD=1
  export npm_config_onnxruntime_node_install_cuda=skip
  npm install --no-audit --fund=false || die "npm install failed. See AGENTS.md § Common Pitfalls."
  ok "dependencies installed"
fi

# ── Native module ───────────────────────────────────────────────────────────
# The backend runs on vanilla Node, so better-sqlite3 must match Node's ABI.
if [ "$MODE" != "web" ] && [ -d node_modules/better-sqlite3 ] && [ ! -d node_modules/better-sqlite3/build ]; then
  step "Rebuilding better-sqlite3 against Node headers"
  npm run rebuild:native || warn "native rebuild failed — database features may not work"
fi

# ── Package build ───────────────────────────────────────────────────────────
# base-nodes and the other decorator packages always resolve from dist/, so the
# server has no node types at all until this has run once.
if [ "$MODE" != "web" ] && [ ! -d packages/base-nodes/dist ]; then
  step "Building backend packages (only the first time)"
  npm run build:packages || die "build:packages failed"
  ok "packages built"
fi

PORT="${PORT:-7777}"

case "$MODE" in
  server)
    step "Starting API server on http://localhost:${PORT}"
    echo "   health check: curl http://localhost:${PORT}/health"
    echo "   TypeScript source hot-reloads; Ctrl-C to stop."
    exec npm run dev:server
    ;;
  full)
    step "Starting API (:${PORT}) and web UI (http://localhost:3000)"
    exec npm run dev
    ;;
  web)
    step "Starting web UI on http://localhost:3000"
    exec npm run dev:web
    ;;
  check)
    step "Typechecking"
    npm run typecheck || die "typecheck failed"
    step "Linting"
    npm run lint || die "lint failed"
    step "Testing"
    npm run test || die "tests failed"
    ok "typecheck, lint, and tests all pass"
    ;;
esac
