---
layout: page
title: "API Server Overview"
---



NodeTool exposes a single TypeScript HTTP + WebSocket server runtime built on Node.js. The same process serves REST API routes, WebSocket workflow execution endpoints, and OpenAI-compatible `/v1` routes.

The server is implemented in the `@nodetool-ai/websocket` package (`packages/websocket/src/server.ts`).

## Key Modules

- **`server.ts`** – HTTP/WebSocket server entry point. Registers all API routes and starts listeners.
- **`unified-websocket-runner.ts`** – Handles WebSocket connections for workflow execution and chat.
- **`http-api.ts`** – Core REST API routes (workflows, jobs, assets, etc.).
- **`models-api.ts`** – Model management and provider registration.
- **`settings-api.ts`** – Settings and configuration endpoints.
- **`storage-api.ts`** – File upload and asset storage endpoints.
- **`mcp-server.ts`** – Model Context Protocol (MCP) server integration.
- **`openai-api.ts`** – OpenAI-compatible `/v1/chat/completions` endpoint.
- **`debug-api.ts`** – Debug endpoints (local development only).

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
npm run dev:server   # tsx --watch packages/websocket/src/server.ts
```

## Configuration

The server is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `7777` | HTTP listen port |
| `HOST` | `127.0.0.1` | Bind address |
| `DB_PATH` | `~/.local/share/nodetool/nodetool.sqlite3` | SQLite database path |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `OLLAMA_API_URL` | `http://localhost:11434` | Ollama server URL |

## Health Check

```
GET /health
```

Returns `200 OK` with `{ status: "ok" }` when the server is ready.

For mode and deployment setup, see [Deployment Guide](deployment.md) and [Authentication](authentication.md#authentication-providers).
