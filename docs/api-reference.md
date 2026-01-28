---
layout: page
title: "API Reference"
---



## API Families and Why They Exist

NodeTool exposes three closely related API surfaces:

- **Editor API (NodeTool application / desktop)**  
  - Served by `nodetool serve` (`src/nodetool/api/server.py`).  
  - Used by the NodeTool desktop app and local web UI to manage workflows, assets, jobs, and settings.  
  - Acts as the **control plane** for authoring and debugging; includes dev-only endpoints such as the terminal WebSocket and debug tooling.  
  - Intended to run on a trusted local machine, not as a public internet API.

- **Worker API (deployable instance)**  
  - Served by `nodetool worker` (`src/nodetool/deploy/worker.py`).  
  - Provides a **stable, hardened runtime surface** for external clients: OpenAI-compatible chat, workflow execution, admin and storage routes, and health checks.  
  - Designed for self-hosted, RunPod, Cloud Run, and other remote deployments; all non-health endpoints sit behind Bearer auth and TLS.

- **Chat Server API (chat-only runtime)**  
  - Served by `nodetool chat-server` (`src/nodetool/chat/server.py`).  
  - Minimal OpenAI-compatible `/v1/chat/completions` and `/v1/models` plus `/health` for environments where you only need chat, not workflows or admin routes.

This split exists because:

- The desktop/editor needs full control over local resources and rich debug features, while deployed workers must *not* expose those capabilities.
- The worker API is a small, stable contract you can safely integrate against and deploy widely; the editor API can evolve with the UI and internal architecture.
- Separating **control plane** (Editor API) from **data plane** (Worker/Chat server) makes scaling, security hardening, and multi-environment deployments simpler.

## Unified Endpoint Matrix

The table below summarizes key endpoints across the three surfaces. For detailed schemas, see [Chat API](chat-api.md) and [Workflow API](workflow-api.md).

| Surface                 | Area       | Path / Prefix                     | Method / Protocol | Auth                                         | Streaming                        | Notes |
|-------------------------|-----------|-----------------------------------|-------------------|----------------------------------------------|----------------------------------|-------|
| Editor, Worker, Chat    | Models    | `/v1/models`                      | `GET`             | Bearer when `AUTH_PROVIDER` enforces         | no                               | OpenAI-compatible model listing |
| Editor, Worker, Chat    | Chat      | `/v1/chat/completions`           | `POST`            | Bearer when `AUTH_PROVIDER` enforces         | SSE when `\"stream\": true`      | OpenAI-compatible chat; SSE or single JSON |
| Editor                  | Workflows | `/api/workflows`                 | `GET`             | Depends on `AUTH_PROVIDER`                   | no                               | List workflows for the local app |
| Worker                  | Workflows | `/workflows`                     | `GET`             | Depends on `AUTH_PROVIDER`                   | no                               | List workflows on a worker instance |
| Worker                  | Workflows | `/workflows/{id}/run`            | `POST`            | Depends on `AUTH_PROVIDER`                   | no                               | Run a workflow once, return final outputs |
| Worker                  | Workflows | `/workflows/{id}/run/stream`     | `POST` (SSE)      | Depends on `AUTH_PROVIDER`                   | yes (SSE, server → client)       | Stream workflow progress and results |
| Editor                  | Chat WS   | `/chat`                          | WebSocket         | Bearer header or `api_key` query when enforced | yes                            | Bidirectional chat, tools, and workflow triggering |
| Editor                  | Jobs WS   | `/predict`                       | WebSocket         | Bearer header or `api_key` query when enforced | yes                            | Workflow/job execution and reconnection |
| Editor                  | Updates   | `/updates`                       | WebSocket         | Follows global auth settings                 | yes                             | System and job updates stream |
| Editor (dev-only)       | Terminal  | `/terminal`                      | WebSocket         | Same as `/chat`/`/predict` (when enabled)    | yes                             | Host terminal access; gated by `NODETOOL_ENABLE_TERMINAL_WS` |
| Worker                  | Health    | `/health`                        | `GET`             | none                                         | no                               | JSON worker health (public) |
| Worker                  | Ping      | `/ping`                          | `GET`             | none                                         | no                               | JSON ping with timestamp (public) |
| Editor, Chat            | Health    | `/health`                        | `GET`             | none                                         | no                               | Basic liveness; string or JSON |
| Worker                  | Storage   | `/admin/storage/*`               | `HEAD/GET/PUT/DELETE` | Bearer when enforced                      | streaming for `GET`              | Admin asset/temp storage (full CRUD) |
| Worker                  | Storage   | `/storage/*`                     | `HEAD/GET`        | none or proxy-protected                      | streaming for `GET`              | Public read-only asset/temp access |

> When `AUTH_PROVIDER` is `local` or `none`, editor and worker endpoints accept requests without a token for convenience. When it is `static` or `supabase`, include `Authorization: Bearer <token>` on every request except `/health` and `/ping`.

## Authentication and Headers

- HTTP: `Authorization: Bearer <token>` on all non-public routes.
- WebSocket (Editor API): `Authorization: Bearer <token>` header (preferred) or `api_key`/`token` query parameter for legacy clients.
- SSE: `Authorization: Bearer <token>` and `Accept: text/event-stream`.

See [Authentication](authentication.md) for full token handling rules and the different `AUTH_PROVIDER` modes across editor and worker deployments.

## Streaming Behavior

- `/v1/chat/completions` uses OpenAI-style SSE when `stream` is true; otherwise it returns a single JSON response.
- Editor WebSockets:
  - `/predict` streams workflow/job events until completion or cancellation.
  - `/chat` streams chat tokens, tool calls, and agent/workflow events.
- Worker SSE:
  - `/workflows/{id}/run/stream` sends job update and output events, then a final `[DONE]`.
- Worker storage routes stream file contents for large assets.

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
  "output": {
    "image": {
      "type": "image",
      "uri": "http://localhost:7777/storage/assets/abc123.png"
    },
    "caption": "Generated image of a cyberpunk cityscape..."
  }
}
```

### Streaming Workflow Execution

For long-running workflows, use streaming to get real-time progress updates:

```bash
# Stream workflow execution (SSE)
curl -X POST "http://localhost:7777/workflows/YOUR_WORKFLOW_ID/run/stream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Accept: text/event-stream" \
  -d '{
    "params": {
      "prompt": "Analyze this document and extract key points"
    }
  }'
```

Streaming response (Server-Sent Events):
```
data: {"type": "job_update", "status": "running", "job_id": "job_123"}

data: {"type": "node_update", "node_id": "node_1", "node_name": "Agent", "status": "running"}

data: {"type": "node_progress", "node_id": "node_1", "progress": 50, "total": 100}

data: {"type": "node_update", "node_id": "node_1", "node_name": "Agent", "status": "completed"}

data: {"type": "job_update", "status": "completed", "result": {"output": "..."}}

data: [DONE]
```

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
# List all workflows (Editor API)
curl "http://localhost:7777/api/workflows" \
  -H "Authorization: Bearer YOUR_TOKEN"

# List workflows on a deployed worker
curl "http://your-worker:7777/workflows" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Health Check

```bash
# Check if server is running (no auth required)
curl "http://localhost:7777/health"
```

Response:
```json
{"status": "healthy"}
```

### CLI Workflow Execution

You can also run workflows directly from the command line:

```bash
# Run workflow by ID
nodetool run workflow_abc123

# Run workflow from file
nodetool run ./my_workflow.json

# Run with JSONL output (for automation)
nodetool run workflow_abc123 --jsonl

# Run with parameters from stdin
echo '{"workflow_id": "abc123", "params": {"prompt": "test"}}' | nodetool run --stdin
```

### Python Client Example

```python
import requests

# Configuration
BASE_URL = "http://localhost:7777"
TOKEN = "your_token_here"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# Run a workflow
def run_workflow(workflow_id: str, params: dict) -> dict:
    response = requests.post(
        f"{BASE_URL}/api/workflows/{workflow_id}/run",
        headers=HEADERS,
        json={"params": params}
    )
    response.raise_for_status()
    return response.json()

# Stream workflow execution
def stream_workflow(workflow_id: str, params: dict):
    response = requests.post(
        f"{BASE_URL}/workflows/{workflow_id}/run/stream",
        headers={**HEADERS, "Accept": "text/event-stream"},
        json={"params": params},
        stream=True
    )
    
    for line in response.iter_lines():
        if line:
            line = line.decode('utf-8')
            if line.startswith('data: '):
                data = line[6:]  # Remove 'data: ' prefix
                if data != '[DONE]':
                    import json
                    event = json.loads(data)
                    print(f"Event: {event['type']}")
                    if event.get('status') == 'completed':
                        return event.get('result')

# Using OpenAI client (works with NodeTool!)
from openai import OpenAI

client = OpenAI(
    api_key=TOKEN,
    base_url=f"{BASE_URL}/v1"
)

# Chat completion
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)

# Streaming
for chunk in client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True
):
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### JavaScript/Node.js Example

```javascript
const BASE_URL = 'http://localhost:7777';
const TOKEN = 'your_token_here';

// Run a workflow
async function runWorkflow(workflowId, params) {
  const response = await fetch(`${BASE_URL}/api/workflows/${workflowId}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ params })
  });
  return response.json();
}

// Stream workflow execution
async function streamWorkflow(workflowId, params) {
  const response = await fetch(`${BASE_URL}/workflows/${workflowId}/run/stream`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    },
    body: JSON.stringify({ params })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        const event = JSON.parse(line.slice(6));
        console.log('Event:', event.type, event.status);
        
        if (event.status === 'completed') {
          return event.result;
        }
      }
    }
  }
}

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
- [Workflow API](workflow-api.md) — Editor vs Worker workflow paths and streaming.  
- [API Server Overview](api-server.md) — Editor API architecture and modules.  
- [Deployment Guide](deployment.md) — How workers are built and exposed.  
- [Chat Server](chat-server.md) — Minimal chat-only deployments.  
- [CLI Reference](cli.md) — Commands for `serve`, `worker`, and `chat-server`.
