#!/usr/bin/env bash
# Container entrypoint for nodetool/sandbox-agent.
#
# Starts the X11 desktop stack (Xvfb + fluxbox + x11vnc + websockify) and
# the Node tool server. The desktop stack is required for:
#   - browser_* tools (Chromium renders against :99)
#   - desktop_* tools (xdotool/scrot act on :99)
#   - live viewing via noVNC over websockify
#
# Disable the desktop stack by setting NODETOOL_HEADLESS=1 — the tool server
# will still start, and browser tools will launch headless Chromium on demand.
set -euo pipefail

TOOL_PORT="${NODETOOL_TOOL_PORT:-7788}"
VNC_WS_PORT="${NODETOOL_VNC_PORT:-6080}"
VNC_DISPLAY="${NODETOOL_VNC_DISPLAY:-:99}"
VNC_GEOMETRY="${NODETOOL_VNC_GEOMETRY:-1280x900x24}"

if [[ "${NODETOOL_HEADLESS:-0}" != "1" ]]; then
  # Start a virtual X server.
  Xvfb "${VNC_DISPLAY}" -screen 0 "${VNC_GEOMETRY}" -nolisten tcp &
  XVFB_PID=$!

  # Give Xvfb a moment to create the socket. We don't block forever — if it
  # fails to start, the downstream commands below will surface the error.
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if [[ -S "/tmp/.X11-unix/X${VNC_DISPLAY#:}" ]]; then break; fi
    sleep 0.1
  done

  export DISPLAY="${VNC_DISPLAY}"

  # Minimal window manager so apps get decorations + focus.
  fluxbox >/dev/null 2>&1 &

  # VNC over x11vnc; no password, bound to localhost. The published host
  # port (random ephemeral) is the real access control.
  x11vnc -display "${VNC_DISPLAY}" -forever -nopw -quiet -shared \
    -localhost -rfbport 5900 >/dev/null 2>&1 &

  # Expose VNC over WebSocket for browser-based noVNC viewers.
  websockify --web=/usr/share/novnc "${VNC_WS_PORT}" localhost:5900 \
    >/dev/null 2>&1 &
fi

cd /opt/sandbox-agent
exec node dist/entry.js
