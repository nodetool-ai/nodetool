---
name: nodetool-api-reference
description: "Integrate with NodeTool over REST, tRPC, MsgPack WebSocket, MCP, or the OpenAI-compatible Chat API, including the document surfaces and workflow execution."
---

You help users integrate with NodeTool's HTTP + WebSocket server (default `http://localhost:7777`). Start it with `nodetool serve` (flags: `--host`, `--port`).

# Surfaces

| Surface | Path prefix | Use case |
|---------|-------------|----------|
| **REST** | `/api/...` | Workflows, assets, collections, models, bundles, health |
| **tRPC** | `/trpc/...` | The document surfaces: timelines, storyboards, sketches, scripts, applications, JS scripts, projects, skills, settings |
| **OpenAI-compatible** | `/v1/...` | Chat completions + model list |
| **WebSocket** | `/ws` | Run/cancel/stream jobs, live chat, live editor tools |
| **MCP** | `/mcp` | Agent tools over streamable HTTP, for Claude Desktop and CLI agents |

Auth is controlled by environment variables, not CLI flags (§ Authentication).

**Pick the right surface.** REST covers workflows, assets and the portable
bundles. Everything that is a *document* someone edits (a timeline sequence, a
storyboard, a sketch, a script, a mini app, a JS script) is a tRPC router, and
the REST routes for those kinds cover only import, export and build. An
integration that reads or writes a document calls tRPC, or calls the agent
capability of the same name over `/mcp`.

# Authentication

The server picks its auth mode from `SUPABASE_URL` and `SUPABASE_KEY` alone. It
reads neither `AUTH_PROVIDER` nor `NODETOOL_SERVER_MODE`.

| Mode | Enabled by | Accepted credentials |
|------|------------|----------------------|
| Local | Default, with the Supabase variables unset | Loopback connections run as user `"1"` with no token. `NODETOOL_TRUST_LOCALHOST=false` turns that off. Sources in `NODETOOL_TRUST_LOCAL_NETWORKS` (comma-separated CIDRs) also run as user `"1"` with no token. A bearer equal to `SERVER_AUTH_TOKEN` runs as user `"1"`. A token minted by `nodetool deploy users-add` runs as that API user. Anything else gets `401`. |
| Supabase | `SUPABASE_URL` and `SUPABASE_KEY` both set | Every non-public request needs a valid Supabase JWT. `SERVER_AUTH_TOKEN`, `NODETOOL_TRUST_LOCAL_NETWORKS` and API-user tokens are ignored. Loopback is trusted only with `NODETOOL_TRUST_LOCALHOST=true`. |

In both modes, an access token (`ntk_…`) created in **Settings → MCP → Connect
an agent remotely** authenticates as the person who created it. Send any token
as `Authorization: Bearer <token>`. A WebSocket client that cannot set headers
passes `?api_key=<token>` on the `/ws` URL.

# REST Endpoints

## Workflows

```bash
# List workflows
curl http://localhost:7777/api/workflows \
  -H "Authorization: Bearer TOKEN"

# Get a workflow
curl http://localhost:7777/api/workflows/<id> \
  -H "Authorization: Bearer TOKEN"

# Export helpers
curl http://localhost:7777/api/workflows/<id>/dsl-export      # TypeScript DSL
curl http://localhost:7777/api/workflows/<id>/export-bundle   # .nodetool bundle (zip)
```

Run a saved workflow over REST. This is the route `run_workflow`,
`debug_workflow` and `nodetool debug` use. The editor runs over WebSocket
instead (§ WebSocket API).

```bash
curl -X POST http://localhost:7777/api/workflows/<id>/run \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"params": {"prompt": "a red fox"}}'
# Same body, returns the full debug report (summary and verdict) instead of the run row
curl -X POST http://localhost:7777/api/workflows/<id>/debug ...
```

The body also takes `background: true` to return a job id at once, and
`interactive: true` to park on escalations as a debug session (below).

## Documents (tRPC)

The routers under `/trpc`, one per document kind:
`timeline`, `storyboards`, `sketch`, `scripts`, `applications`, `jsScripts`,
`documents`, `workflows`, `projects`, `assets`, `collections`, `jobs`, `runs`,
`appRuns`, `appInstances`, `resources`, `models`, `customProviders`, `nodes`,
`memories`, `messages`, `threads`, `settings`, `skills`, `storage`, `packs`,
`costs`, `credits`, `files`, `fonts`, `games`, `integrations`, `triggers`,
`externalMcp`, `agentAccess`, `users`, `worker`, `workspace`.

Each follows the same shape: `list`, `get`, `create`, `update` (compare-and-swap
on `updated_at`), `delete`, plus sub-routers. Whole-document snapshots are
`timeline.versions`, `sketch.documentVersions` and `jsScripts.documentVersions`
(`sketch.versions` is a different thing: the per-layer generation takes).
`applications` also carries `publish`, `released`, `deploy`, `budget` and
`usage`, because publishing an app locks in the current graph of every workflow
it runs and caps what it may spend. Read the router in
`packages/websocket/src/trpc/routers/` for the exact procedure names rather than
guessing them. `/trpc/healthz` answers without auth.

An agent reaches the same data through the capability tools, which need no
client: `list_timelines`, `get_storyboard`, `edit_sketch`, `save_js_script`,
`edit_app`, and so on.

## Document REST routes

The REST side of the document kinds is import, export and build.

```bash
# Mini apps
curl http://localhost:7777/api/applications/:id/export-bundle       # app + every bound graph
curl -X POST http://localhost:7777/api/applications/import-bundle
curl -X POST http://localhost:7777/api/applications/build           # {prompt|spec, provider, model, ...}
curl -X POST http://localhost:7777/api/applications/debug
curl http://localhost:7777/api/applications/examples
curl -X POST http://localhost:7777/api/applications/examples/:slug/install

# Timelines and storyboards
curl http://localhost:7777/api/timelines/:id/export-zip
curl -X POST http://localhost:7777/api/timelines/import-zip
curl http://localhost:7777/api/storyboards/:id/export-zip
curl -X POST http://localhost:7777/api/timelines/:id/isolate-subject

# Native games: the published revision as a zip (target=web or tauri)
curl -o game.zip 'http://localhost:7777/api/games/:id/export-zip?target=tauri'
# Compile the desktop executable on this machine; streams cargo output as NDJSON (refused on hosted servers)
curl -N -X POST http://localhost:7777/api/games/:id/build-executable

# JS scripts
curl -X POST http://localhost:7777/api/js-scripts/:id/run
```

A build or an interactive debug runs for minutes, so those routes accept
`poll: true`, return a session id, and are read at
`GET /api/debug/sessions/:id` until they settle. Cancel with
`POST /api/debug/sessions/:id/cancel`.

## Collections (RAG)

```bash
# Upload a text file into a collection (multipart, field name "file")
curl -X POST http://localhost:7777/api/collections/<name>/index \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@notes.md"
```

The route indexes text only: plain text, Markdown, HTML, CSV and JSON. It
returns `415` for PDFs, Office files and images, which need an indexing
workflow. The collection must have an embedding model.

## Models

```bash
# OpenAI-compatible model list
curl http://localhost:7777/v1/models -H "Authorization: Bearer TOKEN"
```

## Storage / Assets

```bash
# Asset bytes are served under /api/storage/...
curl http://localhost:7777/api/storage/<path>
```

## Health

```bash
curl http://localhost:7777/health      # liveness (no auth)
curl http://localhost:7777/ready        # readiness
curl http://localhost:7777/api/health   # detailed health
```

# Chat API (OpenAI-Compatible)

## HTTP

```bash
# Chat completion
curl -X POST http://localhost:7777/v1/chat/completions \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.4",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'

# Streaming (Server-Sent Events)
curl -X POST http://localhost:7777/v1/chat/completions \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-5.4", "messages": [{"role": "user", "content": "Hi"}], "stream": true}'
```

## Python Client (OpenAI SDK)

```python
import openai

client = openai.OpenAI(api_key="TOKEN", base_url="http://localhost:7777/v1")

response = client.chat.completions.create(
    model="gpt-5.4",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)

# Streaming
stream = client.chat.completions.create(
    model="gpt-5.4",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

## JavaScript Client

```typescript
const response = await fetch("http://localhost:7777/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer TOKEN",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-5.4",
    messages: [{ role: "user", content: "Hello!" }],
    stream: false,
  }),
});
const data = await response.json();
console.log(data.choices[0].message.content);
```

# WebSocket API — Running Jobs

**Endpoint**: `ws(s)://<host>/ws`. Messages are an envelope `{ command, data }`.
The server replies in MsgPack until the client sends `set_mode` with
`"text"`. A JSON client sends that first, or `JSON.parse` fails on every reply.
Identity comes from the connection's credential (§ Authentication), not from
fields in the request body.

```typescript
const socket = new WebSocket("ws://localhost:7777/ws?api_key=<token>");

socket.onopen = () => {
  socket.send(JSON.stringify({ command: "set_mode", data: { mode: "text" } }));
  // Start a workflow run
  socket.send(JSON.stringify({
    command: "run_job",
    data: {
      type: "run_job_request",
      workflow_id: "<id>",
      job_type: "workflow",
      params: { input_name: "value" },
      job_id: "<id>",
    },
  }));
};

socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case "job_update":
      console.log(`Job ${msg.status}`); // running | completed | failed | cancelled | suspended
      if (msg.result) console.log("Result:", msg.result);
      break;
    case "node_update":
      console.log(`Node ${msg.node_name}: ${msg.status}`);
      break;
    case "node_progress":
      console.log(`Progress: ${msg.progress}/${msg.total}`);
      break;
    case "output_update":
      console.log(`Output ${msg.output_name}:`, msg.value);
      break;
    case "chunk":
      process.stdout.write(msg.content);
      break;
    case "log_update":
      console.log(`[${msg.severity}] ${msg.content}`);
      break;
  }
};
```

## Job Control Commands

```typescript
socket.send(JSON.stringify({ command: "cancel_job",  data: { job_id: "...", workflow_id: "..." } }));
socket.send(JSON.stringify({ command: "get_status",  data: { job_id: "..." } }));
socket.send(JSON.stringify({ command: "reconnect_job", data: { job_id: "...", workflow_id: "..." } }));

// Stream input into a running node, then close the stream
socket.send(JSON.stringify({ command: "stream_input",     data: { job_id: "...", input: "name", value: "data", handle: "..." } }));
socket.send(JSON.stringify({ command: "end_input_stream", data: { job_id: "...", input: "name", handle: "..." } }));
```

There is no pause or resume. An unknown command returns `Unknown command`.

# Server Message Types

| Type | Key fields | Purpose |
|------|-----------|---------|
| `job_update` | `status`, `result`, `error`, `cost` | Job lifecycle |
| `node_update` | `node_id`, `node_name`, `status`, `error`, `result` | Node lifecycle |
| `node_progress` | `progress`, `total`, `chunk` | Progress tracking |
| `output_update` | `output_name`, `value`, `output_type` | Node output values |
| `log_update` | `content`, `severity` | Log messages |
| `chunk` | `content`, `done` | Streaming text |

# MCP

`/mcp` serves the agent capability tools over streamable HTTP, so an outside
agent drives NodeTool with the same calls the in-product agent uses. Reach it
three ways:

- `nodetool mcp install` configures a CLI agent (Claude Code, Codex).
- In a NodeTool checkout, `npm run build:mcpb` builds `dist/nodetool.mcpb`, a one-file bundle Claude
  Desktop installs by drag-and-drop. It is a stdio-to-HTTP bridge against a
  running server's `/mcp`, and it starts in offline mode when the server is
  down, then hot-attaches when it appears.
- A deployed server is reached by pointing the client at `/mcp` with a token
  minted in **Settings → MCP → Connect an agent remotely**.

# Server Management (CLI)

```bash
nodetool serve                        # Start server (default 127.0.0.1:7777)
nodetool serve --host 0.0.0.0          # Bind all interfaces
nodetool serve --port 8080             # Custom port
nodetool workflows list                # List saved workflows
nodetool workflows get <id>            # Get workflow details
nodetool workflows run <id>            # Run a workflow (uses the local DB)
nodetool jobs list                     # List execution jobs
nodetool secrets store OPENAI_API_KEY  # Store an API key
```
