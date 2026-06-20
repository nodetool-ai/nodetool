---
layout: page
title: "Serving Chat (OpenAI-Compatible API)"
description: "Serve chat over an OpenAI-compatible HTTP API with `nodetool serve`."
---



There is no separate `chat-server` command. To serve chat over HTTP, run the NodeTool server with `nodetool serve`. It
listens on `127.0.0.1:7777` by default and exposes an **OpenAI-compatible** chat API alongside the WebSocket endpoint.

## Quick Start

```bash
# Start the server (default 127.0.0.1:7777)
nodetool serve

# Bind all interfaces on a custom port
nodetool serve --host 0.0.0.0 --port 8080
```

The server provides:

- `POST /v1/chat/completions` — OpenAI-compatible chat completions (streaming and non-streaming).
- `GET /v1/models` — OpenAI-compatible model list.
- `/ws` — the WebSocket endpoint used by the editor and `nodetool chat --url`.

## Chat Completions: `POST /v1/chat/completions`

**URL:** `http://localhost:7777/v1/chat/completions`

**Request:**

```bash
curl http://localhost:7777/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Set `"stream": true` to receive Server-Sent Events with OpenAI-compatible `chat.completion.chunk` payloads, terminated
by `data: [DONE]`.

## Models: `GET /v1/models`

```bash
curl http://localhost:7777/v1/models
```

## Integration Example (JavaScript)

```javascript
const response = await fetch("http://localhost:7777/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello, AI!" }],
    stream: true
  })
});
```

Because the endpoint is OpenAI-compatible, any OpenAI client SDK works by pointing its base URL at
`http://localhost:7777/v1`.

## See Also

- [Chat API](chat-api.md) — Full request/response schemas, streaming, and tool calls.
- [NodeTool CLI](cli.md) — `nodetool serve` options.
- [Deployment Guide](deployment.md) — Running the server in production.
