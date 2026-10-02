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

`/v1` passes the request straight to one provider. It does not run the NodeTool agent, so there are no tools beyond the `tools` you send. The agent loop is reached over `/ws`. Requests go through the server's normal authentication. See [Authentication](authentication.md#authentication-modes).

## Chat Completions: `POST /v1/chat/completions`

**URL:** `http://localhost:7777/v1/chat/completions`

**Request:**

```bash
curl http://localhost:7777/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.6",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Set `"stream": true` to receive Server-Sent Events with OpenAI-compatible `chat.completion.chunk` payloads, terminated
by `data: [DONE]`. Without it the response is one `chat.completion` object.

The request accepts `model`, `messages`, `stream`, `tools`, `temperature`, `top_p`, `max_tokens`, `presence_penalty`, and
`frequency_penalty`. A response with tool calls has `finish_reason` `tool_calls`. Non-streaming `usage` reports `0` for
every count.

### How the model picks the provider

The server chooses the provider from the `model` prefix:

| Model starts with | Provider | Credential |
|---|---|---|
| `gpt-`, `o1`, `o3` | OpenAI | `OPENAI_API_KEY` |
| `claude-` | Anthropic | `ANTHROPIC_API_KEY` |
| anything else | Ollama | `OLLAMA_API_URL` (default `http://127.0.0.1:11434`) |

The key comes from the caller's secret store, then the environment. Without `model` the request uses `llama3.2:latest`.
Invalid JSON returns `400`. A provider that fails to initialize returns `500` with an OpenAI-style `error` object.

## Models: `GET /v1/models`

```bash
curl http://localhost:7777/v1/models
```

The list is fixed, not queried from your providers: `llama3.2:latest`, `gpt-4`, `gpt-4o`, `gpt-4o-mini`,
`claude-sonnet-4-20250514`, and `claude-opus-4-20250514`. Chat completions accept any model ID the prefix rules route.
Use `nodetool models list` to see the models your install can run.

## Integration Example (JavaScript)

```javascript
const response = await fetch("http://localhost:7777/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gpt-5.6",
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
