#!/usr/bin/env bash
# Copies the AppDir of package-linux.sh, stages the NodeTool server into
# usr/share/nodetool-timeline/backend (scripts/stage-server.sh) and writes
# nodetool-timeline-with-server-linux-x64.AppImage to the current folder.
# Opened without a file, the app starts that server
# (src/server/BundledServer.h). linuxdeploy scans only usr/bin and usr/lib,
# so the backend's Node and native modules keep their own library paths.
# Run from the repository root after package-linux.sh, which downloads
# linuxdeploy to $RUNNER_TEMP and deploys the AppDir.
set -euo pipefail
plain=native/timeline/build-ci/AppDir
dir=native/timeline/build-ci/AppDir-with-server
[[ -x "$plain/usr/bin/nodetool-timeline" ]] || { echo "error: run package-linux.sh first" >&2; exit 1; }
[[ -x "$RUNNER_TEMP/linuxdeploy" ]] || { echo "error: no linuxdeploy in RUNNER_TEMP" >&2; exit 1; }
rm -rf "$dir"
cp -a "$plain" "$dir"
NT_SERVER_LOG_DIR=native/timeline/build-ci native/timeline/scripts/stage-server.sh "$dir/usr/share/nodetool-timeline/backend"
export APPIMAGE_EXTRACT_AND_RUN=1 LDAI_OUTPUT=nodetool-timeline-with-server-linux-x64.AppImage
"$RUNNER_TEMP/linuxdeploy" --appdir "$dir" --output appimage
ls -la "$LDAI_OUTPUT"
