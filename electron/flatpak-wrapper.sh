#!/bin/bash
# Flatpak wrapper script for NodeTool
# This script launches the Electron application inside the Flatpak sandbox

set -e

# Set application directory
APP_DIR="/app/nodetool"

# Ensure we're using the correct node from the sandbox
export PATH="/app/bin:$PATH"

# Launch Electron application
exec /app/bin/electron "$APP_DIR/dist-electron/main.js" "$@"
