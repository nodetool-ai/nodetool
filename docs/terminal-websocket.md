---
layout: page
title: "Terminal WebSocket Endpoint"
---

This document describes the WebSocket endpoint that exposes an interactive terminal connected to the host system shell. It is intended for development and debugging only and should stay disabled in production.

## Overview

- Interactive shell session exposed over WebSocket.
- Uses the host system shell:
  - POSIX: `SHELL` env var or `/bin/bash` fallback, launched as a login shell (`-l`).
  - Windows: `powershell.exe` by default (can be overridden with an env var).
- Inherits the current process environment, including the active conda environment, so existing tools remain available.
- Integrates with a React terminal emulator (e.g., xterm.js) using a simple JSON/MessagePack protocol.

## Enabling the Endpoint

The endpoint is disabled by default and hard-blocked in production.

- Set `NODETOOL_ENABLE_TERMINAL_WS=1` in your environment to enable it for local development or tests.
- In production (`Environment.is_production()`), the server will refuse connections regardless of the flag.
- The flag is read directly from `os.environ` and is intentionally not part of the public settings registry.

## Endpoint

- URL: `ws(s)://<host>/terminal`
- Auth: Uses the same WebSocket authentication flow as `/predict` and `/chat` (token in header or query param).
- Protocol: JSON or MessagePack messages. Binary frames are treated as MessagePack; text frames are treated as JSON.

## Message Protocol

Client → Server

- `{"type": "input", "data": "<string>"}` — raw keystrokes from the terminal emulator.
- `{"type": "resize", "cols": <int>, "rows": <int>}` — resize the PTY/console.
- `{"type": "ping"}` — optional heartbeat.

Server → Client

- `{"type": "output", "data": "<string>"}` — shell output to render.
- `{"type": "exit", "code": <int>}` — shell exited with code.
- `{"type": "error", "message": "<string>"}` — non-fatal error.
- `{"type": "pong", "ts": <float>}` — response to `ping`.

## Shell Behavior

### POSIX

- Launches `[shell, "-l"]` attached to a PTY for proper line editing and colors.
- Resizes via `TIOCSWINSZ` when `resize` messages arrive.

### Windows

- Launches `powershell.exe` (or override) with pipes; may lack full PTY semantics until ConPTY support is added.

## React Frontend Integration

- Use a terminal emulator like xterm.js.
- On connect, wire `onData` to send `input` messages and send an initial `resize` payload.
- On incoming `output`, call `term.write(data)`.
- On `exit`, show a session-ended notice and disable input; offer reconnect as needed.

## Security Notes

- Dangerous capability: blocks in production by default.
- Require authentication; optionally add role checks before exposing in any shared environment.
- Limit concurrent sessions and idle timeouts where possible.
- Avoid logging terminal input/output; log only session metadata (user, start/end, exit code).
