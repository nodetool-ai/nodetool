---
name: nodetool-api-reference
description: Use NodeTool REST API, WebSocket protocol, Chat API (OpenAI-compatible), workflow execution endpoints, and streaming responses. Use when user asks about API endpoints, WebSocket protocol, how to call the API, build a client, integrate with NodeTool, or stream workflow results.
---

You help users integrate with NodeTool's HTTP + WebSocket server (default `http://localhost:7777`). Start it with `nodetool serve` (flags: `--host`, `--port`).

# Surfaces

| Surface | Path prefix | Use case |
|---------|-------------|----------|
| **REST** | `/api/...` | Workflows, assets, collections, models, health |
| **OpenAI-compatible** | `/v1/...` | Chat completions + model list |
| **WebSocket** | `/ws`, `/ws/agent` | Run/cancel/stream jobs, live chat |

The server mode (`desktop` / `private` / `public`) and auth are controlled by
environment variables (`NODETOOL_SERVER_MODE`, `AUTH_PROVIDER`), not CLI flags.

# Authentication

Authenticated endpoints use a Bearer token:
```
Authorization: Bearer <TOKEN>
```

Token source depends on the auth provider:
- `static`: `SERVER_AUTH_TOKEN` env var
- `supabase`: Supabase JWT
- `local` / `none`: no auth required

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

> **Running a workflow is done over WebSocket** (`/ws`, see below), not via a REST
> `/run` endpoint. From a terminal you can also run with the CLI:
> `nodetool workflows run <id> --params '{"key":"value"}'`.

## Collections (RAG)

```bash
# Index a file into a collection
curl -X POST http://localhost:7777/api/collections/<name>/index \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"file_path": "/path/to/document.pdf"}'
```

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
(In the editor, MsgPack is used; JSON also works for simple clients.)

```typescript
const socket = new WebSocket("ws://localhost:7777/ws");

// Start a workflow run
socket.send(JSON.stringify({
  command: "run_job",
  data: {
    type: "run_job_request",
    api_url: "http://localhost:7777/api",
    workflow_id: "<uuid>",
    job_type: "workflow",
    auth_token: "<token>",
    params: { input_name: "value" },
    job_id: "<uuid>",
    user_id: "1",
    execution_strategy: "threaded",
  },
}));

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
socket.send(JSON.stringify({ command: "pause_job",   data: { job_id: "...", workflow_id: "..." } }));
socket.send(JSON.stringify({ command: "resume_job",  data: { job_id: "...", workflow_id: "..." } }));

// Stream input into a running node, then close the stream
socket.send(JSON.stringify({ command: "stream_input",     data: { input: "name", value: "data", handle: "..." } }));
socket.send(JSON.stringify({ command: "end_input_stream", data: { input: "name", handle: "..." } }));
```

# Server Message Types

| Type | Key fields | Purpose |
|------|-----------|---------|
| `job_update` | `status`, `result`, `error`, `cost` | Job lifecycle |
| `node_update` | `node_id`, `node_name`, `status`, `error`, `result` | Node lifecycle |
| `node_progress` | `progress`, `total`, `chunk` | Progress tracking |
| `output_update` | `output_name`, `value`, `output_type` | Node output values |
| `log_update` | `content`, `severity` | Log messages |
| `chunk` | `content`, `done` | Streaming text |

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
