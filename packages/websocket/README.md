# @nodetool-ai/websocket

The Fastify HTTP + WebSocket server — the main NodeTool API (default port 7777).
Hosts the unified websocket runner for workflow and chat operations plus the
tRPC routers and REST endpoints.

## Responsibilities

- `WebSocketClientSession` — per-connection runner with a job concurrency queue.
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

## Environment variables

- `NODETOOL_WS_MAX_MESSAGE_BYTES` — largest inbound WebSocket frame accepted
  before deserialization (bytes; default 256 MiB). A larger frame is rejected
  with a structured error; the connection stays open.
- `NODETOOL_VALIDATE_OUTBOUND_WS` — validates every outbound (server→client)
  frame whose `type` matches a known protocol schema
  (`@nodetool-ai/protocol`'s `processingMessageSchemas` /
  `outboundControlMessageSchemas`) before it goes on the wire. `1`/`true`
  forces it on, `0`/`false` forces it off. Unset, it defaults to on under
  `NODE_ENV=test` or Vitest (`VITEST`) and off otherwise — a malformed frame
  throws in that case, so a bug that produces one fails the test that
  exercised it instead of shipping to production. Frames with an
  unrecognized or absent `type` (the ad hoc `{ error, details }` command
  replies) are never validated.

Inbound frames (client commands) are always validated against the Zod command
schemas in `@nodetool-ai/protocol` (`webSocketCommandEnvelopeSchema`,
`commandDataSchemas`) — there is no opt-out, since a malformed inbound frame
that isn't rejected is exactly what a real client should never be able to send.

API reference: see the `nodetool-api-reference` skill and the root
[AGENTS.md](../../AGENTS.md).
