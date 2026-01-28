---
layout: page
title: "Chat API"
---

NodeTool provides both OpenAI-compatible HTTP endpoints and WebSocket endpoints for chat interactions:

- The **Editor API** (`nodetool serve`, defaults to port **7777**) exposes WebSocket chat at `/chat` and `/predict`, primarily for the desktop/local app.
- The **Worker and Chat Server APIs** (`nodetool worker`, `nodetool chat-server`, defaults to port **7777**) expose OpenAI-compatible HTTP endpoints (`/v1/chat/completions`, `/v1/models`) for remote clients.

See the canonical matrix in [API Reference](api-reference.md#unified-endpoint-matrix) for methods, auth requirements, and streaming behavior.

> **Port Reference**: Both development and production deployments use port 7777 by default. Replace `localhost` with your server hostname for remote connections.

## OpenAI-Compatible HTTP API

NodeTool exposes OpenAI-compatible endpoints that allow you to use standard OpenAI client libraries and tools.
When `AUTH_PROVIDER` is `static` or `supabase`, send `Authorization: Bearer <token>`; in `local`/`none` modes the token
is optional for development.

### Chat Completions: `POST /v1/chat/completions`

**URL:** `http://localhost:7777/v1/chat/completions`

**Headers:**

- `Content-Type: application/json`
- `Authorization: Bearer YOUR_TOKEN`

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

**Example using OpenAI Python client:**

```python
import openai

# For local development: base_url="http://localhost:7777/v1"
# For production/worker: base_url="http://localhost:7777/v1" or your server URL
client = openai.OpenAI(
    api_key="YOUR_TOKEN",
    base_url="http://localhost:7777/v1"
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "Hello, how are you?"}
    ],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content is not None:
        print(chunk.choices[0].delta.content, end="")
```

### Models: `GET /v1/models`

**URL:** `http://localhost:7777/v1/models`

List all available models for the configured provider.

```bash
# For local development and production: http://localhost:7777/v1/models
curl http://localhost:7777/v1/models \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## WebSocket API

NodeTool also exposes a `/chat` WebSocket endpoint for real time conversations. The server side is implemented by
`ChatWebSocketRunner` which handles message parsing, tool execution and streaming responses.

The connection supports both binary (MessagePack) and text (JSON) messages. Authentication can be provided via
`Authorization: Bearer <token>` headers or an `api_key` query parameter.

> **Note**: The WebSocket endpoint is served by the Editor API on port 7777 (development) or your configured server port.

### WebSocket Example usage

```javascript
// For local development: ws://localhost:7777/chat
// For production deployments, use your server URL
const socket = new WebSocket("ws://localhost:7777/chat?api_key=YOUR_KEY");

// Send a chat message
const message = {
  role: "user",
  content: "Hello world",
  model: "gpt-3.5-turbo" // or any supported model
};

socket.onmessage = async (event) => {
  const data = msgpack.decode(new Uint8Array(await event.data.arrayBuffer()));
  if (data.type === "chunk") {
    console.log(data.content);
  }
};

socket.onopen = () => {
  socket.send(msgpack.encode(message));
};
```

### Server responses

Responses from the server may include:

- `chunk` – streamed text from the model
- `tool_call` – a request to execute a tool
- `tool_result` – the result of a tool execution
- `job_update` – status updates when running a workflow
- `error` – error messages

The runner also supports workflow execution by sending a message with a `workflow_id`. In that case the WebSocket will
stream job updates in addition to regular chat responses.
