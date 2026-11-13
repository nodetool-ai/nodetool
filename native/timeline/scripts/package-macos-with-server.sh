#!/usr/bin/env bash
# Packages NodeTool Timeline with the NodeTool server inside, for a test
# build that runs on its own. It runs package-macos.sh, then stages the
# server into Contents/Resources/backend with scripts/stage-server.sh. With
# no arguments the app starts that server (src/server/BundledServer.h) and
# lists its timelines.
#
# The bundle has only an ad-hoc signature, like the bundle of
# package-macos.sh. check-package-macos.sh does not apply to it: the backend
# holds native Node modules outside the licence audit of that script.
#
#   scripts/package-macos-with-server.sh
#   # writes build-package/NodeTool Timeline (with server).app and a .zip
set -euo pipefail

cd "$(dirname "$0")/.."
build=${BUILD_DIR:-build-package}

scripts/package-macos.sh

app="$build/NodeTool Timeline (with server).app"
rm -rf "$app"
cp -R "$build/NodeTool Timeline.app" "$app"
NT_SERVER_LOG_DIR="$build" scripts/stage-server.sh "$app/Contents/Resources/backend"

# Every Mach-O file needs a valid signature on Apple silicon.
codesign --force --deep --sign - "$app" > /dev/null 2>&1
codesign --verify --deep "$app"

arch=$(uname -m)
[[ $arch == x86_64 ]] && arch=x64
zip="$build/nodetool-timeline-with-server-macos-$arch.zip"
rm -f "$zip"
ditto -c -k --keepParent "$app" "$zip"
du -sh "$app" "$zip"
