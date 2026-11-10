#!/usr/bin/env bash
# Packages NodeTool Node Editor with the NodeTool server inside, for a test
# build that runs on its own. It runs package-macos.sh, then copies the
# bundled backend (scripts/bundle-backend.mjs) and the Node runtime that
# Electron ships into Contents/Resources/backend. With no arguments the app
# starts that server (src/server/BundledServer.h) and connects to it.
#
# The bundle has only an ad-hoc signature, like the bundle of
# package-macos.sh, and the same timeline script pattern
# (native/timeline/scripts/package-macos-with-server.sh).
#
#   scripts/package-macos-with-server.sh
#   # writes build-package/NodeTool Node Editor (with server).app and a .zip
set -euo pipefail

cd "$(dirname "$0")/.."
editor=$PWD
root=$(cd ../.. && pwd)
build=${BUILD_DIR:-build-package}

scripts/package-macos.sh

# The backend bundle reads the built packages, so build them first.
(cd "$root" && npm run build:packages > "$editor/$build/server-packages.log")
(cd "$root" && node scripts/bundle-backend.mjs > "$editor/$build/server-bundle.log")
(cd "$root/electron" && node scripts/fetch-node-runtime.mjs > "$editor/$build/server-node.log")

arch=$(uname -m)
[[ $arch == x86_64 ]] && arch=x64
version=$(node -p "require('$root/electron/scripts/node-runtime.constants.cjs').NODE_RUNTIME_VERSION")
runtime="$root/electron/.node-runtime/$version/darwin-$arch"
[[ -x "$runtime/node" ]] || { echo "error: no Node runtime at $runtime" >&2; exit 1; }

app="$build/NodeTool Node Editor (with server).app"
rm -rf "$app"
cp -R "$build/NodeTool Node Editor.app" "$app"
backend="$app/Contents/Resources/backend"
rsync -a --exclude '*.map' "$root/electron/backend-bundle/" "$backend/"
mv "$backend/_modules" "$backend/node_modules"
mkdir -p "$backend/runtime"
cp "$runtime/node" "$backend/runtime/node"
chmod 755 "$backend/runtime/node"

# Every Mach-O file needs a valid signature on Apple silicon.
codesign --force --deep --sign - "$app" > /dev/null 2>&1
codesign --verify --deep "$app"

zip="$build/nodetool-node-editor-with-server-macos-$arch.zip"
rm -f "$zip"
ditto -c -k --keepParent "$app" "$zip"
du -sh "$app" "$zip"
