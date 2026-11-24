---
layout: page
title: "API Server Overview"
description: "Run the full NodeTool HTTP and WebSocket server with `nodetool server serve`: install, flags, environment variables, and health checks."
---

`nodetool server serve` runs the full NodeTool server: the REST API, `/trpc`,
WebSocket workflow execution and chat at `/ws`, the `/mcp` endpoint, and the
OpenAI-compatible `/v1` routes. It also serves the built web app when one is
present.

`nodetool serve` without `server` starts a smaller execution server instead.
It runs core nodes only, needs `SECRETS_MASTER_KEY` and `NODETOOL_API_TOKEN`,
and has no `/v1`, `/mcp`, or web app. See
[`nodetool serve`](cli.md#nodetool-serve).

## Running the Server

The full server ships in the `cli-server` command feature.

```bash
# Install the CLI globally (once)
npm install -g @nodetool-ai/cli

# Add the server feature (once)
nodetool packs add cli-server --yes

# Start the server
nodetool server serve --host 127.0.0.1 --port 7777
```

## Configuration

The server is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `7777` | HTTP listen port |
| `HOST` | `127.0.0.1` (`0.0.0.0` when `NODETOOL_ENV=production`) | Bind address |
| `NODETOOL_ENV` | — | Set to `production` for production defaults. The `/mcp` mount is then off unless `NODETOOL_ENABLE_MCP=1`. |
| `DB_PATH` | `~/.local/share/nodetool/nodetool.sqlite3` | SQLite database path. Do not set together with `DATABASE_URL`. |
| `DATABASE_URL` | — | PostgreSQL URL (`postgres://` / `postgresql://`) or SQLite URL/path (`file:` / `sqlite:`) |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `OLLAMA_API_URL` | `http://127.0.0.1:11434` | Ollama server URL |

`nodetool server serve --host <host> --port <port>` sets `HOST` and `PORT` for the server process and overrides any value already in the environment. See [Environment Variables](environment-variables.md) for the full list.

## Health Check

```
GET /health
```

Returns `200 OK` when healthy and `503` when the database check fails (`"status": "degraded"`) or the server is draining for a rolling deploy (`"status": "draining"`). The body:

```json
{
  "status": "ok",
  "timestamp": "2026-06-20T00:00:00.000Z",
  "uptime": 123,
  "turns": 0,
  "jobs": 0,
  "services": { "database": "ok", "server": "ok" }
}
```

`turns` and `jobs` count chat turns and workflow runs in flight. A rolling deploy waits for both to reach `0` before it replaces the machine.

`GET /ready` is a simple liveness probe (always `200` with `{ "status": "ok" }`),
and `GET /api/health` returns `{ version, uptime }`. None require authentication.

For deployment setup, see [Deployment Guide](deployment.md) and [Authentication](authentication.md#authentication-modes).
