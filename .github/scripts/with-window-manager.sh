#!/usr/bin/env bash
# Run a command under Xvfb with a D-Bus session and a ready window manager.
# The VST host's editor test opens a JUCE window, which needs a display and
# window-manager atoms even headlessly. Without them the host segfaults.
# Needs xvfb, xauth, dbus-x11, xfwm4 and x11-utils.
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 2
fi

exec xvfb-run -a dbus-run-session -- bash -euo pipefail -c '
  xfwm4 --compositor=off --sm-client-disable &
  wm_pid=$!
  trap "kill $wm_pid 2>/dev/null || true" EXIT
  for attempt in {1..300}; do
    if xprop -root _NET_SUPPORTING_WM_CHECK | grep -q "window id"; then
      "$@"
      exit 0
    fi
    if ! kill -0 "$wm_pid" 2>/dev/null; then
      echo "Window manager exited before becoming ready" >&2
      wait "$wm_pid"
      exit 1
    fi
    sleep 0.1
  done
  echo "Window manager did not become ready" >&2
  exit 1
' with-window-manager "$@"
