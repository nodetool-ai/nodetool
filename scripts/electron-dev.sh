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

# Native modules are loaded inside Electron's utilityProcess.fork(), whose ABI
# matches the installed Electron's embedded Node. Rebuild against Electron
# headers. Use the *installed* Electron version (not the range in package.json)
# so a stale node_modules can't silently build for the wrong ABI.
ELECTRON_VERSION=$(node -p "require('./node_modules/electron/package.json').version")
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
  GYARCH="arm64"
else
  GYARCH="x64"
fi
NATIVE_STAMP="node_modules/.electron-native-rebuild-stamp"
STAMP_VALUE="electron-${ELECTRON_VERSION}-${GYARCH}"
if [[ -f "${NATIVE_STAMP}" ]] && [[ "$(cat "${NATIVE_STAMP}")" == "${STAMP_VALUE}" ]]; then
  echo "Native modules already built for Electron ${ELECTRON_VERSION} (${GYARCH}), skipping rebuild."
else
  echo "Rebuilding native modules for Electron ${ELECTRON_VERSION} (${GYARCH})..."
  (cd node_modules/better-sqlite3 && rm -rf build && npx node-gyp rebuild --target="$ELECTRON_VERSION" --arch="$GYARCH" --dist-url=https://electronjs.org/headers)
  (cd node_modules/bufferutil     && rm -rf build && npx node-gyp rebuild --target="$ELECTRON_VERSION" --arch="$GYARCH" --dist-url=https://electronjs.org/headers)
  echo -n "${STAMP_VALUE}" > "${NATIVE_STAMP}"
fi

# Start web Vite server
echo "Starting web Vite server on ${WEB_DEV_SERVER_URL}..."
npm --prefix web run dev &
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
