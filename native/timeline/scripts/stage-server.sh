#!/usr/bin/env bash
# Stages the NodeTool server for a "with server" package into DEST: the
# bundled backend (scripts/bundle-backend.mjs --profile timeline) with its
# external packages in node_modules, and the Node runtime that Electron
# ships in runtime/node (runtime/node.exe on Windows). The app starts it
# through src/server/BundledServer.h. Runs on macOS, Windows (Git Bash) and
# Linux, for the host platform.
#
# It needs an installed workspace (npm ci). better-sqlite3 is built for the
# Node on PATH, so that Node must be the bundled runtime version (.nvmrc).
#
#   scripts/stage-server.sh DEST
#   NT_SERVER_LOG_DIR=build-package scripts/stage-server.sh DEST
set -euo pipefail

[[ $# == 1 ]] || { echo "usage: $0 DEST" >&2; exit 2; }
mkdir -p "$(dirname "$1")"
dest="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
root=$(cd "$(dirname "$0")/../../.." && pwd)
logs=${NT_SERVER_LOG_DIR:-$(dirname "$dest")}
mkdir -p "$logs"
logs=$(cd "$logs" && pwd)

constants="$root/electron/scripts/node-runtime.constants.cjs"
version=$(cd "$root" && node -p "require('./electron/scripts/node-runtime.constants.cjs').NODE_RUNTIME_VERSION")
if [[ $(node --version) != "v$version" ]]; then
    echo "error: node $(node --version) is on PATH, the bundled runtime is v$version ($constants)" >&2
    exit 1
fi
platform=$(node -p process.platform)
arch=$(node -p process.arch)
binary=node
[[ $platform == win32 ]] && binary=node.exe

bundle="$dest.bundle"
rm -rf "$bundle"
trap 'rm -rf "$bundle"' EXIT

# The backend bundle reads the built packages, so build them first.
(cd "$root" && npm run build:packages > "$logs/server-packages.log")
(cd "$root" && node scripts/bundle-backend.mjs --profile timeline --out "$bundle" > "$logs/server-bundle.log")
(cd "$root/electron" && node scripts/fetch-node-runtime.mjs "$platform-$arch" > "$logs/server-node.log")
runtime="$root/electron/.node-runtime/$version/$platform-$arch/$binary"
[[ -f "$runtime" ]] || { echo "error: no Node runtime at $runtime" >&2; exit 1; }

rm -rf "$dest"
mkdir -p "$dest/runtime"
cp -R "$bundle/." "$dest/"
find "$dest" -name '*.map' -type f -delete
mv "$dest/_modules" "$dest/node_modules"
cp "$runtime" "$dest/runtime/$binary"
chmod 755 "$dest/runtime/$binary"
du -sh "$dest"
