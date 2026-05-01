---
name: nodetool-api-reference
description: Use NodeTool REST API, WebSocket protocol, Chat API (OpenAI-compatible), workflow execution endpoints, and streaming responses. Use when user asks about API endpoints, WebSocket protocol, how to call the API, build a client, integrate with NodeTool, or stream workflow results.
---

You help users integrate with NodeTool's APIs. There are three API surfaces.

# API Surfaces

| Surface | Start Command | Use Case |
|---------|--------------|----------|
| **Editor API** | `nodetool serve` | Full control, dev, WebSocket |
| **Server API** | `nodetool serve --mode private` | Hardened REST, production |
| **Chat Server** | `nodetool chat-server` | Chat-only, OpenAI-compatible |

# Authentication

All authenticated endpoints use Bearer token:
```
Authorization: Bearer <TOKEN>
```

Token source depends on auth provider:
- `static`: `SERVER_AUTH_TOKEN` env var
- `supabase`: Supabase JWT
- `local`/`none`: No auth required

# REST Endpoints

## Workflows

```bash
# List workflows
curl http://localhost:7777/api/workflows/ \
  -H "Authorization: Bearer TOKEN"

# Get workflow
curl http://localhost:7777/api/workflows/<id> \
  -H "Authorization: Bearer TOKEN"

# Run workflow (blocking)
curl -X POST http://localhost:7777/api/workflows/<id>/run \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"params": {"prompt": "hello world"}}'

# Run workflow (streaming SSE)
curl -X POST http://localhost:7777/workflows/<id>/run/stream \
  -H "Authorization: Bearer TOKEN" \
  -H "Accept: text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"params": {"prompt": "hello world"}}'
```

## Models

```bash
# List available models (OpenAI-compatible)
curl http://localhost:7777/v1/models \
  -H "Authorization: Bearer TOKEN"
```

## Health

```bash
# Health check (no auth required)
curl http://localhost:7777/health
```

## Storage

```bash
# Check asset exists
curl -I http://localhost:7777/storage/<path>

# Download asset
curl http://localhost:7777/storage/<path>
```

# Chat API (OpenAI-Compatible)

## HTTP

```bash
# Chat completion
curl -X POST http://localhost:7777/v1/chat/completions \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'

# Streaming chat
curl -X POST http://localhost:7777/v1/chat/completions \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

## Python Client (OpenAI SDK)

```python
import openai

client = openai.OpenAI(
    api_key="TOKEN",
    base_url="http://localhost:7777/v1"
)

# Non-streaming
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)

# Streaming
stream = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
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
    "Authorization": "Bearer TOKEN",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello!" }],
    stream: false
  })
});
const data = await response.json();
console.log(data.choices[0].message.content);
```

# WebSocket API

**Endpoint**: `ws(s)://<host>/ws`

## Run a Job

```typescript
const socket = new WebSocket("ws://localhost:7777/ws");

// Send run_job command
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
    user_id: "<user>",
    graph: { nodes: [], edges: [] },
    execution_strategy: "threaded"
  }
}));

// Handle messages
socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case "job_update":
      console.log(`Job ${msg.status}`); // running|completed|failed|cancelled|suspended
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
// Cancel
socket.send(JSON.stringify({ command: "cancel_job", data: { job_id: "...", workflow_id: "..." } }));

// Pause
socket.send(JSON.stringify({ command: "pause_job", data: { job_id: "...", workflow_id: "..." } }));

// Resume
socket.send(JSON.stringify({ command: "resume_job", data: { job_id: "...", workflow_id: "..." } }));

// Reconnect to running job
socket.send(JSON.stringify({ command: "reconnect_job", data: { job_id: "...", workflow_id: "..." } }));

// Stream input to a running node
socket.send(JSON.stringify({
  command: "stream_input",
  data: { input: "name", value: "data", handle: "..." }
}));

// End input stream
socket.send(JSON.stringify({
  command: "end_input_stream",
  data: { input: "name", handle: "..." }
}));
```

## WebSocket Chat

```typescript
const socket = new WebSocket("ws://localhost:7777/chat?api_key=TOKEN");

socket.onopen = () => {
  socket.send(JSON.stringify({
    role: "user",
    content: "Hello",
    model: "gpt-4o"
  }));
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "chunk") {
    process.stdout.write(data.content);
  }
};
```

# Streaming SSE Response Format

When using `stream=true` or the `/run/stream` endpoint, responses come as Server-Sent Events:

```
data: {"type": "job_update", "status": "running", "job_id": "..."}

data: {"type": "node_progress", "node_name": "Agent", "progress": 1, "total": 5}

data: {"type": "chunk", "content": "Hello", "done": false}

data: {"type": "output_update", "output_name": "text", "value": "...", "output_type": "str"}

data: {"type": "job_update", "status": "completed", "result": {...}}
```

# Server Message Types

| Type | Key Fields | Purpose |
|------|-----------|---------|
| `job_update` | `status`, `result`, `error`, `duration` | Job lifecycle |
| `node_update` | `node_id`, `node_name`, `status`, `error`, `result` | Node lifecycle |
| `node_progress` | `progress`, `total`, `chunk` | Progress tracking |
| `output_update` | `output_name`, `value`, `output_type` | Node output values |
| `preview_update` | `value` | Preview node data |
| `log_update` | `content`, `severity` | Log messages |
| `chunk` | `content`, `done` | Streaming text |

# Server Management

```bash
nodetool serve                        # Start server (default port 7777)
nodetool serve --port 8080            # Custom port
nodetool serve --host 0.0.0.0         # Bind all interfaces
nodetool workflows list               # List saved workflows
nodetool workflows get <id>           # Get workflow details
nodetool jobs list                    # List execution jobs
nodetool secrets store OPENAI_API_KEY # Store API key
```
