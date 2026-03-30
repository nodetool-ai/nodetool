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

# Check if any TS workspace package has source changes newer than its dist/
PACKAGES_STALE=0
for pkg_dir in packages/*/; do
  if [[ -d "${pkg_dir}src" ]] && grep -q '"build"' "${pkg_dir}package.json" 2>/dev/null; then
    if [[ ! -d "${pkg_dir}dist" ]] || \
       [[ -n "$(find "${pkg_dir}src" -newer "${pkg_dir}dist" -print -quit 2>/dev/null)" ]]; then
      echo "Package $(basename "${pkg_dir}") has changes."
      PACKAGES_STALE=1
    fi
  fi
done

if [[ ${PACKAGES_STALE} -eq 1 ]]; then
  echo "Rebuilding workspace packages (ordered)..."
  npm run build:packages || { echo "ERROR: Package build failed."; exit 1; }
  echo "Package build done."
else
  echo "All packages up to date."
fi

# Start web Vite server
echo "Starting web Vite server on ${WEB_DEV_SERVER_URL}..."
npm --prefix web start &
WEB_SERVER_PID=$!

# Only rebuild electron if source changed since last build (or packages were rebuilt)
ELECTRON_MARKER="electron/dist-electron/main.js"
if [[ ! -f "${ELECTRON_MARKER}" ]] || \
   [[ -n "$(find electron/src electron/vite.config.ts -newer "${ELECTRON_MARKER}" -print -quit 2>/dev/null)" ]] || \
   [[ ${PACKAGES_STALE} -eq 1 ]]; then
  echo "Building Electron main/preload bundle..."
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
