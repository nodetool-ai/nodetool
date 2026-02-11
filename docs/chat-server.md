---
layout: page
title: "NodeTool Chat Server"
---



The `nodetool chat-server` command runs a **chat-only HTTP API** exposing OpenAI-compatible endpoints for
`/v1/chat/completions` and `/v1/models`, plus a `/health` check. It does **not** expose the `/chat` WebSocket endpoint;
that lives on the Editor API (`nodetool serve`). See [API Reference](api-reference.md#api-families-and-why-they-exist)
for how the Chat Server fits into the broader API surface.

## Quick Start

```bash
# Start chat server on default port 8080
nodetool chat-server

# Start on custom host/port
nodetool chat-server --host 0.0.0.0 --port 3000

# Use a custom provider/model
nodetool chat-server --provider openai --default-model gpt-4
```

## OpenAI-Compatible HTTP API

### Chat Completions: `POST /v1/chat/completions`

**URL:** `http://localhost:8080/v1/chat/completions`

**Headers:**

- `Content-Type: application/json`
- `Authorization: Bearer YOUR_TOKEN` (required when auth is enforced)

**Request Body:**

```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "Hello, how are you?"}
  ],
  "stream": true
}
```

**Response (streaming SSE):**

Server-Sent Events with OpenAI-compatible payloads:

```text
data: {"id": "...", "object": "chat.completion.chunk", ...}
data: {"id": "...", "object": "chat.completion.chunk", ...}
data: [DONE]
```

**Response (non-streaming):**

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1694268190,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! I'm doing well, thank you for asking."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 15,
    "total_tokens": 27
  }
}
```

### Models: `GET /v1/models`

**URL:** `http://localhost:8080/v1/models`

```bash
curl http://localhost:8080/v1/models \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Health Check

The chat server exposes a simple health endpoint:

```bash
curl http://127.0.0.1:8080/health
```

`/health` returns a JSON body indicating server status. It is public by default; put it behind a proxy if you need it
private.

## Testing

Run the example client:

```bash
# Start the server in one terminal
nodetool chat-server

# Test in another terminal
python examples/chat_server_examples.py
```

## Configuration

### Environment Variables

- `NODETOOL_ENVIRONMENT`: Set to `production` for production mode
- `SUPABASE_URL`: Supabase project URL (for remote auth)
- `SUPABASE_KEY`: Supabase API key (for remote auth)

### Authentication Modes

**Local Mode (default):**

- No authentication required
- Uses `user_id = "1"` for all requests
- Suitable for development and testing

**Remote Mode (`--remote-auth`):**

- Requires valid Supabase JWT tokens
- Validates tokens against Supabase auth
- Suitable for production deployments

## Integration Example (JavaScript)

```javascript
const response = await fetch('http://localhost:8080/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [
      { role: 'user', content: 'Hello, AI!' }
    ],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') break;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices[0]?.delta?.content;
        if (content) {
          console.log('AI Response:', content);
        }
      } catch (e) {
        // Skip malformed JSON
      }
    }
  }
}
```

Use the JavaScript example above as a template; the same pattern works in Python with `requests` + `iter_lines()` for SSE streaming.

## Error Handling

Errors are propagated as:

- HTTP 401 for authentication failures.
- HTTP 500 for server errors.
- Error events in the SSE stream for runtime errors.

## Deployment

The chat server can be deployed standalone or integrated into existing FastAPI applications by importing and mounting
the OpenAI-compatible router from `nodetool.api.openai.create_openai_compatible_router` or by invoking `run_chat_server`
from `nodetool.chat.server`. For full workflow execution and storage, use the Server API described in
[Deployment Guide](deployment.md).
