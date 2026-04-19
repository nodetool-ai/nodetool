#!/usr/bin/env bash
# Container entrypoint for nodetool/sandbox-agent.
#
# Phase 1: only starts the Node tool server.
# Phase 2 will start Xvfb + fluxbox + x11vnc + websockify before the tool
# server. The commented block below is kept as a reference for that upgrade.
set -euo pipefail

TOOL_PORT="${NODETOOL_TOOL_PORT:-7788}"
# VNC_PORT="${NODETOOL_VNC_PORT:-6080}"

# --- Phase 2 (desktop stack) — enable when browser/desktop tools ship. -------
# Xvfb :99 -screen 0 1440x900x24 -nolisten tcp &
# sleep 0.5
# fluxbox >/dev/null 2>&1 &
# x11vnc -display :99 -forever -nopw -quiet -shared -rfbport 5900 &
# websockify --web=/usr/share/novnc "${VNC_PORT}" localhost:5900 &
# -----------------------------------------------------------------------------

cd /opt/sandbox-agent
exec node dist/entry.js
