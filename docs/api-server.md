---
layout: page
title: "API Server Overview"
description: "The unified NodeTool HTTP + WebSocket server — REST routes, workflow execution, and OpenAI-compatible `/v1` endpoints."
---



NodeTool exposes a single TypeScript HTTP + WebSocket server runtime built on Node.js. The same process serves REST API routes, tRPC procedures under `/trpc`, WebSocket workflow execution at `/ws`, the `/mcp` endpoint, and OpenAI-compatible `/v1` routes. It also serves the built web app when one is present.

The server is implemented in the `@nodetool-ai/websocket` package (`packages/websocket/src/server.ts`).

## Key Modules

- **`server.ts`** – Fastify entry point. Registers CORS, rate limiting, auth, the WebSocket plugin, tRPC, and the route plugins, then starts the listener.
- **`routes/`** – Fastify route plugins, one per area (health, workflows, assets, nodes, storage, files, collections, applications, timelines, storyboards, OAuth, provider webhooks, `/v1`).
- **`trpc/`** – The tRPC router mounted at `/trpc`. JSON list, metadata, and delete operations live here.
- **`websocket-client-session.ts`** – Handles WebSocket connections for workflow execution and chat.
- **`http-api.ts`** – Shared request handler and options (`handleApiRequest`, `getUserId`) that route plugins call.
- **`models-api.ts`** – Model management and provider registration.
- **`settings-registry.ts`** – Reads setting values from the database. The setting definitions live in `@nodetool-ai/config`.
- **`storage-api.ts`** – Binary `GET` and `HEAD` for stored assets.
- **`mcp-server.ts`** – Model Context Protocol (MCP) server integration, mounted at `/mcp`.
- **`openai-api.ts`** – OpenAI-compatible `/v1/chat/completions` and `/v1/models` endpoints.

## Running the Server

```bash
# Install the CLI globally (once)
npm install -g @nodetool-ai/cli

# Start the server
nodetool serve --host 127.0.0.1 --port 7777

# Or run without installing globally
npx --package=@nodetool-ai/cli nodetool serve --host 0.0.0.0 --port 7777
```

Development (from repo root):

```bash
npm run build:packages
npm run dev:server   # scripts/dev-server.mjs: runs the server from TypeScript source under tsx watch
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

`nodetool serve --host <host> --port <port>` sets `HOST` and `PORT` for the server process and overrides any value already in the environment. See [Configuration](configuration.md#environment-variables-index) for the full list.

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
