#!/usr/bin/env bash
# Copies the package of package-windows.sh and stages the NodeTool server
# into its backend folder (scripts/stage-server.sh). Opened without a file,
# the app starts that server (src/server/BundledServer.h).
# Run from the repository root after package-windows.sh.
set -euo pipefail
plain=native/timeline/build-ci/package-windows
out=native/timeline/build-ci/package-windows-with-server
[[ -f "$plain/nodetool-timeline.exe" ]] || { echo "error: run package-windows.sh first" >&2; exit 1; }
rm -rf "$out"
cp -R "$plain" "$out"
NT_SERVER_LOG_DIR=native/timeline/build-ci native/timeline/scripts/stage-server.sh "$out/backend"
