#!/bin/bash
# Flatpak wrapper script for NodeTool
# Launches the packaged Electron app (electron-builder's linux-unpacked layout,
# installed to /app/nodetool). zypak-wrapper comes from
# org.electronjs.Electron2.BaseApp and lets Chromium's sandbox run inside the
# Flatpak sandbox, where the setuid chrome-sandbox helper cannot.

set -e

exec zypak-wrapper /app/nodetool/nodetool-electron "$@"
