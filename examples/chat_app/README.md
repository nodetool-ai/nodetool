# NodeTool Chat (standalone example)

A dependency-free, single-page AI chat that talks to the **TypeScript NodeTool
server** (`packages/websocket`).

Open it in any modern browser after starting the server — no build step, no
framework, ~700 lines of vanilla JS.

```
examples/chat_app/
├── index.html              Markup, layout, script tags
├── nodetool_logo.png       Logo asset
├── js/
│   ├── markdown.js         Tiny Markdown → HTML renderer (no deps)
│   ├── chat-client.js      tRPC + WebSocket transport (msgpack-encoded)
│   ├── ui.js               DOM construction + update helpers
│   └── main.js             App state, orchestration, event wiring
├── scripts/
│   └── live-test.mjs       End-to-end smoke test against a running server
└── styles/                 Design tokens, layout, components
```

---

## Quick start

```bash
# 1. Start the TS NodeTool server (from repo root)
nvm use
npm run build:packages
npm run dev:nodetool -- serve --port 7777

# 2. In another terminal, serve the example folder over HTTP
#    (do NOT open index.html via file:// — CORS will reject it)
cd examples/chat_app && python3 -m http.server 8080

# 3. Open http://localhost:8080
```

The server binds to `localhost` only by default. Localhost connections bypass
auth and use the built-in user `"1"`, so no token is needed.

---

## Talking to a fake provider (no API keys required)

The runtime ships a `FakeProvider` that streams a configurable canned reply.
Enable it with one env var, then point the chat at it:

```bash
NODETOOL_ENABLE_FAKE_PROVIDER=1 npm run dev:nodetool -- serve --port 7777
```

In the UI, the model dropdown will show `Fake Model v1`, `Fake Model v2`,
`Fake Fast Model` under the `fake` provider. Pick one and chat — every prompt
streams back `Hello, this is a fake response!` in 10-character chunks.

A scripted end-to-end check is included:

```bash
NODETOOL_ENABLE_FAKE_PROVIDER=1 npm run dev:nodetool -- serve --port 7777   # one terminal
node examples/chat_app/scripts/live-test.mjs                                # another terminal
```

It exercises the same flow the browser does (providers → threads.create →
ws chat_message → chunks → final message → threads.delete) and prints PASS/FAIL.

---

## Architecture

The TS server speaks three protocols. The chat client uses all three:

| Resource                       | Transport                                                 |
| ------------------------------ | --------------------------------------------------------- |
| Threads (CRUD)                 | tRPC at `POST /trpc/threads.{create,update,delete}`, `GET /trpc/threads.list` |
| Messages (read)                | tRPC at `GET /trpc/messages.list`                         |
| Providers + LLM models         | tRPC at `GET /trpc/models.providers` and `/trpc/models.llmByProvider` |
| Chat round-trip + streaming    | WebSocket at `/ws` (msgpack frames; JSON fallback)        |

### tRPC envelope

The server is configured with the `superjson` transformer, so every tRPC
request and response is wrapped:

```json
// Request
POST /trpc/threads.create
Content-Type: application/json
{"json": {"title": "New Chat"}}

// Response
{"result": {"data": {"json": {"id": "…", "title": "New Chat", …}}}}
```

`ChatClient._trpc()` hides the wrapping; callers pass and receive plain values.

### WebSocket commands sent by this client

| Direction       | Frame                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------- |
| Client → Server | `{ command: "chat_message", data: { type: "message", role: "user", content, thread_id, model, provider, agent_mode, tools, collections } }` |
| Client → Server | `{ command: "stop", data: { thread_id } }` (was `stop_generation` on the legacy Python server) |

### WebSocket frames consumed by this client

| `data.type`           | Meaning                                                  |
| --------------------- | -------------------------------------------------------- |
| `chunk`               | Streaming text — append to active assistant bubble       |
| `message`             | Full message (assistant final or echoed user)            |
| `tool_call`           | Tool invocation — render an inline indicator             |
| `generation_stopped`  | Server acked a `stop` command                            |
| `thread_update`       | New derived title for the thread                         |
| `error`               | Server-side failure                                      |

All other frame types (`planning_update`, `task_update`, etc.) are ignored.

---

## Customisation

Point at a different server by editing `js/main.js`:

```js
var client = new ChatClient({
  apiUrl: "http://my-nodetool-server:7777",
  wsUrl:  "ws://my-nodetool-server:7777/ws"
});
```

For remote servers that require auth, pass a Bearer token. It is sent on every
REST/tRPC call and appended as `?token=…` on the WebSocket URL:

```js
var client = new ChatClient({
  apiUrl: "https://…",
  wsUrl:  "wss://…",
  authToken: localStorage.getItem("nodetool_token")
});
```

---

## Relation to the main app

This example is intentionally a thin slice of the full NodeTool web app
(`web/`), which adds the visual workflow editor, mini-app launcher, asset
manager, model downloader, and more. The full app uses the same tRPC routers,
REST endpoints, and WebSocket protocol that this client targets.
