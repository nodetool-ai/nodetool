# NodeTool Chat

A standalone, dependency-free AI chat interface that connects to the
[NodeTool](https://github.com/nodetool-ai/nodetool) backend.

Open `index.html` in any modern browser after starting the NodeTool server and
start chatting with local or cloud AI models — no build step required.

---

## Why this is the standout standalone app

NodeTool is a powerful visual workflow builder, but its chat interface is
valuable on its own:

- **Local-first AI chat** — talks to Ollama, GGUF, MLX, and 20+ cloud providers
- **Agent mode** — tool use, web search, code execution, file management
- **Thread history** — persistent conversations stored on your machine
- **Multi-model** — switch models per conversation
- **Zero SaaS** — your messages never leave your machine unless you choose it

This app extracts exactly that feature as a clean, embeddable single-page app.

---

## Running

1. Start the NodeTool backend:

   ```bash
   conda activate nodetool
   nodetool serve --port 7777
   ```

2. Open `chat_app/index.html` in your browser, or serve the folder:

   ```bash
   # Python
   cd chat_app && python3 -m http.server 8080

   # Node.js
   cd chat_app && npx serve .
   ```

3. Navigate to `http://localhost:8080` and start chatting.

---

## Architecture

```
chat_app/
├── index.html           Main HTML page (no build step needed)
├── nodetool_logo.png    Logo asset
├── js/
│   ├── markdown.js      Lightweight Markdown → HTML renderer (no deps)
│   ├── chat-client.js   REST + WebSocket client (MessagePack)
│   ├── ui.js            DOM construction and update helpers
│   └── main.js          App state, orchestration, event wiring
└── styles/
    ├── variables.css    Design tokens (colours, radii, spacing)
    ├── base.css         Reset + typography
    ├── layout.css       Sidebar + main chat layout
    └── components.css   Message bubbles, composer, buttons
```

### WebSocket Protocol

The app uses the same unified WebSocket endpoint as the main NodeTool web app:

| Direction | Message | Description |
|-----------|---------|-------------|
| Client → Server | `{ command: "chat_message", data: { ... } }` | Send a chat message |
| Client → Server | `{ command: "stop_generation", data: { thread_id } }` | Stop streaming |
| Server → Client | `{ type: "chunk", content, done, thread_id }` | Streaming text |
| Server → Client | `{ type: "message", role, content, thread_id }` | Full message |
| Server → Client | `{ type: "tool_call", name, args, thread_id }` | Tool invocation |

All frames are **MessagePack-encoded binary** (with JSON text fallback).
See [../docs/websocket-api.md](../docs/websocket-api.md) and
[../workflow_runner/README.md](../workflow_runner/README.md) for the complete
protocol reference.

### REST Endpoints Used

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/threads/` | List conversation threads |
| `POST` | `/api/threads/` | Create a new thread |
| `DELETE` | `/api/threads/{id}` | Delete a thread |
| `GET` | `/api/messages/?thread_id={id}` | Fetch messages for a thread |
| `GET` | `/api/models/` | List available AI models |

---

## Customisation

**Change the backend URL** — edit the `apiUrl` and `wsUrl` values at the top of
`js/main.js`:

```js
var client = new ChatClient({
  apiUrl: "http://my-nodetool-server:7777",
  wsUrl:  "ws://my-nodetool-server:7777/ws"
});
```

**Authentication** — pass an `authToken` to `ChatClient` if your backend
requires a Bearer token (e.g. when using Supabase auth):

```js
var client = new ChatClient({
  apiUrl: "https://...",
  wsUrl:  "wss://...",
  authToken: localStorage.getItem("nodetool_token")
});
```

---

## Relation to the Main App

This app is intentionally a thin, extractable slice of the NodeTool codebase.
The full web app (`web/`) adds the visual workflow editor, mini-app launcher,
asset manager, model downloader, VibeCoding, and more. The chat module there
(`web/src/components/chat/`) uses the same WebSocket protocol and REST endpoints
that this standalone client targets.
