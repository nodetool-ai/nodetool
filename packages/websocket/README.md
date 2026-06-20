# @nodetool-ai/websocket

The Fastify HTTP + WebSocket server — the main NodeTool API (default port 7777).
Hosts the unified websocket runner for workflow and chat operations plus the
tRPC routers and REST endpoints.

## Responsibilities

- `UnifiedWebSocketRunner` — per-connection runner with a job concurrency queue.
- tRPC routers (`src/trpc/`) with a consistent error shape (`apiCode`).
- REST endpoints (assets, workflows, models, …) and MsgPack WebSocket messages.

## Run

```bash
npm run dev:server          # from repo root (tsx --watch)
node packages/websocket/dist/server.js   # built server
```

## Develop

```bash
npm run build --workspace=packages/websocket
npm run test  --workspace=packages/websocket
npm run lint  --workspace=packages/websocket
```

API reference: see the `nodetool-api-reference` skill and the root
[CLAUDE.md](../../CLAUDE.md).
