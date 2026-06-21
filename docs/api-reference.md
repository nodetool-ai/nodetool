---
layout: page
title: "API Reference"
description: "REST, WebSocket, and OpenAI-compatible API endpoints for NodeTool workflows, chat, and model access."
---



## Server Architecture

NodeTool runs a single Fastify HTTP + WebSocket server (`@nodetool-ai/websocket` — `packages/websocket/src/server.ts`). The same process serves:

- REST routes under `/api/*` (workflows, jobs, assets, models, settings, storage).
- OpenAI-compatible `/v1/chat/completions` and `/v1/models`.
- WebSocket endpoints for workflow execution, chat, the browser extension, downloads, and the agent runtime.
- Health and liveness probes.

Start it with `nodetool serve` (default `127.0.0.1:7777`). `serve` accepts only `--host` and `--port` — there is no `--mode` flag.

## Endpoint Matrix

For detailed schemas, see [Chat API](chat-api.md) and [Workflow API](workflow-api.md).

| Area       | Path                              | Method / Protocol | Auth                                           | Streaming                   | Notes |
|-----------|-----------------------------------|-------------------|------------------------------------------------|-----------------------------|-------|
| Models    | `/v1/models`                      | `GET`             | Bearer when `AUTH_PROVIDER` enforces           | no                          | OpenAI-compatible model listing |
| Chat      | `/v1/chat/completions`            | `POST`            | Bearer when `AUTH_PROVIDER` enforces           | SSE when `"stream": true`   | OpenAI-compatible chat; SSE or single JSON |
| Workflows | `/api/workflows`                  | `GET`             | Depends on `AUTH_PROVIDER`                     | no                          | List workflows |
| Workflows | `/api/workflows/{id}/run`         | `POST`            | Depends on `AUTH_PROVIDER`                     | no                          | Run a workflow once, return final outputs as one JSON response |
| Workflow WS | `/ws`                           | WebSocket         | Bearer header or `api_key` query when enforced | yes                         | Workflow execution, chat, job control, live updates (MessagePack or JSON) |
| Agent WS  | `/ws/agent`                       | WebSocket         | Bearer header or `api_key` query when enforced | yes                         | Agent runtime |
| Extension WS | `/ws/extension`                | WebSocket         | Follows global auth settings                   | yes                         | Browser extension channel |
| Download WS | `/ws/download`                  | WebSocket         | Follows global auth settings                   | yes                         | Model/file downloads |
| Storage   | `/api/storage/*`                  | `HEAD/GET/PUT/DELETE` | Depends on `AUTH_PROVIDER`                  | streaming for `GET`         | Asset/temp storage |
| Health    | `/health`                         | `GET`             | none                                           | no                          | JSON: `{status, timestamp, uptime, services}` (`200`/`503`) |
| Health    | `/api/health`                     | `GET`             | none                                           | no                          | JSON: `{version, uptime}` |
| Liveness  | `/ready`                          | `GET`             | none                                           | no                          | Always `200` with `{status:"ok"}` |

> When `AUTH_PROVIDER` is `local` or `none`, endpoints accept requests without a token for convenience. When it is `static` or `supabase`, include `Authorization: Bearer <token>` on every request except the health/liveness routes.

## Authentication and Headers

NodeTool uses Bearer token authentication. The behavior depends on your `AUTH_PROVIDER` setting:

| AUTH_PROVIDER | Token Required? | Use Case |
|---------------|----------------|----------|
| `local` / `none` | No | Local development, desktop app |
| `static` | Yes — use the configured static token | Simple deployments with a shared secret |
| `supabase` | Yes — use a Supabase JWT | Production deployments with user management |

### How to include credentials

- **HTTP requests:** `Authorization: Bearer <token>` header on all non-public routes
- **WebSocket:** `Authorization: Bearer <token>` header (preferred) or `api_key` query parameter
- **SSE streams (`/v1/chat/completions`):** `Authorization: Bearer <token>` and `Accept: text/event-stream`

> **Local development:** When running locally with the default config (`AUTH_PROVIDER=local`), no token is needed. You can omit the `Authorization` header entirely.

See [Authentication](authentication.md) for full token handling rules.

## Streaming Behavior

- `/v1/chat/completions` uses OpenAI-style SSE when `stream` is true; otherwise it returns a single JSON response.
- `POST /api/workflows/{id}/run` does **not** stream — it runs the workflow to completion and returns one JSON response.
- The `/ws` WebSocket streams workflow/job events (`job_update`, `node_update`, `node_progress`, `output_update`, `chunk`, …) and chat tokens/tool calls. See the [WebSocket API](websocket-api.md) for the full protocol.
- Storage routes stream file contents for large assets.

---

## Headless Mode: Running Workflows via CLI/API

NodeTool can run entirely without the UI—perfect for automation, CI/CD pipelines, and programmatic integrations. This section shows how to execute workflows from the command line or via HTTP requests.

### Quick Start: Run a Workflow via cURL

```bash
# Run a workflow and get results (non-streaming)
curl -X POST "http://localhost:7777/api/workflows/YOUR_WORKFLOW_ID/run" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "params": {
      "prompt": "A cyberpunk cityscape at sunset",
      "style": "photorealistic"
    }
  }'
```

Response:
```json
{
  "job_id": "job_abc123",
  "workflow_id": "YOUR_WORKFLOW_ID",
  "status": "completed",
  "outputs": {
    "image": {
      "type": "image",
      "uri": "http://localhost:7777/api/storage/assets/abc123.png"
    },
    "caption": "Generated image of a cyberpunk cityscape..."
  },
  "error": null,
  "message_count": 12,
  "background": false
}
```

`outputs` is an object keyed by output-node name. The route does not stream — for
real-time progress, run the workflow over the [WebSocket API](websocket-api.md).

### Chat API (OpenAI-Compatible)

NodeTool exposes OpenAI-compatible endpoints, so you can use standard OpenAI clients:

```bash
# Simple chat completion
curl -X POST "http://localhost:7777/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Explain quantum computing in simple terms"}
    ]
  }'
```

Response:
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1699000000,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Quantum computing uses quantum mechanics..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 150,
    "total_tokens": 160
  }
}
```

### Streaming Chat

```bash
# Streaming chat (prints tokens as they arrive)
curl -X POST "http://localhost:7777/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Write a haiku about programming"}
    ],
    "stream": true
  }'
```

Streaming response:
```
data: {"id":"chatcmpl-123","choices":[{"delta":{"role":"assistant"},"index":0}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Code"},"index":0}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":" flows"},"index":0}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":" like"},"index":0}]}

data: [DONE]
```

### List Available Models

```bash
curl "http://localhost:7777/v1/models" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "object": "list",
  "data": [
    {"id": "gpt-4", "object": "model", "owned_by": "openai"},
    {"id": "gpt-3.5-turbo", "object": "model", "owned_by": "openai"},
    {"id": "claude-3-opus", "object": "model", "owned_by": "anthropic"},
    {"id": "gpt-oss:20b", "object": "model", "owned_by": "ollama"}
  ]
}
```

### List Workflows

```bash
# List all workflows
curl "http://localhost:7777/api/workflows" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Health Check

```bash
# Check if server is running (no auth required)
curl "http://localhost:7777/health"
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-06-20T00:00:00.000Z",
  "uptime": 123,
  "services": { "database": "ok", "server": "ok" }
}
```

### CLI Workflow Execution

You can also run workflows from the command line. `nodetool run` executes a
TypeScript/JavaScript DSL workflow file:

```bash
# Run a DSL workflow file
nodetool run ./my_workflow.ts

# Output results as JSON
nodetool run ./my_workflow.ts --json
```

To run a saved workflow by ID (requires a running server), use the `workflows`
subcommands:

```bash
# List workflows
nodetool workflows list

# Run a workflow by ID
nodetool workflows run workflow_abc123 --params '{"prompt": "test"}'
```

### TypeScript / Node.js Client Example

```javascript
const BASE_URL = 'http://localhost:7777';
const TOKEN = 'your_token_here';

// Run a workflow (runs to completion, returns one JSON response)
async function runWorkflow(workflowId, params) {
  const response = await fetch(`${BASE_URL}/api/workflows/${workflowId}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ params })
  });
  const body = await response.json();
  // body: { job_id, workflow_id, status, outputs, error, message_count, background }
  return body.outputs;
}

// For real-time progress, run the workflow over the WebSocket endpoint instead.
// See the WebSocket API page and examples/workflow_runner/js/workflow-runner.js.

// Using OpenAI SDK (works with NodeTool!)
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: TOKEN,
  baseURL: `${BASE_URL}/v1`
});

const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(completion.choices[0].message.content);
```

### Python Client Example

```python
import requests

BASE_URL = "http://localhost:7777"
TOKEN = "your_token_here"  # Not needed for local development
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
}

# List workflows
workflows = requests.get(f"{BASE_URL}/api/workflows", headers=HEADERS).json()

# Run a workflow (runs to completion, returns one JSON response)
result = requests.post(
    f"{BASE_URL}/api/workflows/{workflows[0]['id']}/run",
    headers=HEADERS,
    json={"params": {"prompt": "A sunset over mountains"}},
).json()
# result: {"job_id", "workflow_id", "status", "outputs", "error", "message_count", "background"}
print("Outputs:", result["outputs"])

# For real-time progress, run the workflow over the WebSocket endpoint instead.

# Use with OpenAI Python SDK (works with NodeTool!)
from openai import OpenAI

client = OpenAI(api_key=TOKEN, base_url=f"{BASE_URL}/v1")
completion = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(completion.choices[0].message.content)
```

### Finding Your Workflow ID

To run a workflow via API, you need its ID. Here's how to find it:

1. **From the UI:** Open a workflow in the editor — the ID appears in the browser URL bar
2. **From the API:** Call `GET /api/workflows` to list all workflows with their IDs
3. **From the CLI:** Run `nodetool workflows list`

### Error Handling

API errors return standard HTTP status codes with JSON error bodies:

```json
{
  "error": {
    "message": "Workflow not found: invalid_id",
    "type": "not_found",
    "code": 404
  }
}
```

| Status Code | Meaning | Common Causes |
|-------------|---------|---------------|
| 400 | Bad Request | Invalid parameters, malformed JSON |
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Token lacks permission |
| 404 | Not Found | Workflow/resource doesn't exist |
| 422 | Validation Error | Parameter validation failed |
| 500 | Internal Error | Server-side error |
| 503 | Service Unavailable | Server overloaded or starting up |

---

## Related Guides

- [Chat API](chat-api.md) — OpenAI-compatible request/response schema and WebSocket usage.  
- [Workflow API](workflow-api.md) — Workflow REST paths and execution.  
- [API Server Overview](api-server.md) — Server architecture and modules.  
- [Deployment Guide](deployment.md) — How servers are built and exposed.  
- [CLI Reference](cli.md) — Commands including `serve`.
