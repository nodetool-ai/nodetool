#!/bin/bash
set -euo pipefail

WEB_DEV_SERVER_URL="${NT_WEB_DEV_SERVER_URL:-http://127.0.0.1:3000}"
WEB_SERVER_PID=""

cleanup() {
  if [[ -n "${WEB_SERVER_PID}" ]]; then
    kill "${WEB_SERVER_PID}" >/dev/null 2>&1 || true
    wait "${WEB_SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

if [[ -z "${CONDA_PREFIX:-}" ]]; then
  echo "ERROR: CONDA_PREFIX is not set."
  echo "Activate your conda environment first, e.g. 'conda activate nodetool'."
  exit 1
fi

# The Electron main process has native modules compiled for Electron's Node ABI.
# The backend runs as a separate system Node process (via tsx), so we need
# native modules must match Electron's embedded Node ABI (dev server now
# runs via ELECTRON_RUN_AS_NODE, same binary as production utility process).
echo "Rebuilding native modules for Electron ABI (force)..."
ELECTRON_VERSION=$(node -e "process.stdout.write(require('./electron/package.json').devDependencies.electron)")
(cd node_modules/better-sqlite3 && npx node-gyp rebuild --target="$ELECTRON_VERSION" --arch=x64 --dist-url=https://electronjs.org/headers)
(cd node_modules/bufferutil && npx node-gyp rebuild --target="$ELECTRON_VERSION" --arch=x64 --dist-url=https://electronjs.org/headers)

# Start web Vite server
echo "Starting web Vite server on ${WEB_DEV_SERVER_URL}..."
npm --prefix web start &
WEB_SERVER_PID=$!

# Only rebuild electron if source changed since last build
ELECTRON_MARKER="electron/dist-electron/main.js"
if [[ ! -f "${ELECTRON_MARKER}" ]] || \
   [[ -n "$(find electron/src electron/vite.config.ts -newer "${ELECTRON_MARKER}" -print -quit 2>/dev/null)" ]]; then
  echo "Building Electron main/preload bundle (parallel)..."
  npm --prefix electron run vite:build &
  ELECTRON_BUILD_PID=$!
  if ! wait "${ELECTRON_BUILD_PID}"; then
    echo "ERROR: Electron build failed."
    exit 1
  fi
  echo "Electron build done."
else
  echo "Electron build is up to date, skipping."
fi

# Wait for Vite server to be ready
echo "Waiting for Vite server..."
for _ in {1..120}; do
  if curl -sf "${WEB_DEV_SERVER_URL}" >/dev/null; then
    break
  fi
  sleep 0.5
done

if ! curl -sf "${WEB_DEV_SERVER_URL}" >/dev/null; then
  echo "ERROR: Vite server did not become ready at ${WEB_DEV_SERVER_URL}."
  exit 1
fi

echo "Starting Electron in dev mode..."
NT_ELECTRON_DEV_MODE=1 NT_WEB_DEV_SERVER_URL="${WEB_DEV_SERVER_URL}" \
  npm --prefix electron run start:devmode
