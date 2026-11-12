#!/usr/bin/env bash
# Runs a development build of NodeTool Timeline with the timeline server, as
# the packaged app does (scripts/package-macos-with-server.sh). It builds the
# app, bundles the backend with the timeline profile into
# $BUILD_DIR/server-backend, and starts the app with NT_BUNDLED_BACKEND_DIR set.
# The app then starts that server on a free loopback port.
#
# The first run builds the packages and the bundle. Later runs keep the bundle.
# Use --rebuild-server after a change to the backend packages.
#
#   scripts/run-with-server.sh                    # build-media, keep the bundle
#   scripts/run-with-server.sh --rebuild-server   # bundle the backend again
#   BUILD_DIR=build scripts/run-with-server.sh
#
# The server writes to ~/Library/Application Support/nodetool-timeline/server.log.
# Arguments after the options go to the app.
set -euo pipefail

cd "$(dirname "$0")/.."
timeline=$PWD
root=$(cd ../.. && pwd)
build=${BUILD_DIR:-build-media}
backend="$timeline/$build/server-backend"

rebuild=0
if [[ ${1:-} == --rebuild-server ]]; then
    rebuild=1
    shift
fi

[[ -f "$build/CMakeCache.txt" ]] || { echo "error: $build is not a configured build directory" >&2; exit 1; }
cmake --build "$build" --target nodetool-timeline

if [[ $rebuild == 1 || ! -f "$backend/server.mjs" ]]; then
    echo "Bundling the timeline server into $backend"
    (cd "$root" && npm run build:packages > "$timeline/$build/server-packages.log")
    rm -rf "$backend"
    (cd "$root" && node scripts/bundle-backend.mjs --profile timeline --out "$backend" > "$timeline/$build/server-bundle.log")
    mv "$backend/_modules" "$backend/node_modules"
    mkdir -p "$backend/runtime"
    cp "$(command -v node)" "$backend/runtime/node"
    chmod 755 "$backend/runtime/node"
fi

NT_BUNDLED_BACKEND_DIR="$backend" exec "$build/nodetool-timeline" "$@"
