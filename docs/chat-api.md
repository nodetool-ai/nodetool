---
layout: page
title: "Chat API"
description: "NodeTool's chat endpoints — OpenAI-compatible HTTP plus WebSocket chat for local and remote clients."
---

Chat runs over two interfaces on the server started by `nodetool serve` (port **7777** by default):

```bash
curl http://localhost:7777/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-5.6", "messages": [{"role": "user", "content": "Hello"}]}'
```

- OpenAI-compatible HTTP: `/v1/chat/completions` and `/v1/models`.
- WebSocket `/ws`, which carries chat and workflow messages.

See [API Reference](api-reference.md) for methods, auth requirements, and streaming behavior. Replace `localhost` with your server hostname for remote connections.

## OpenAI-Compatible HTTP API

Standard OpenAI client libraries work against these endpoints. When `AUTH_PROVIDER` is `static` or `supabase`, send `Authorization: Bearer <token>`. In `local`/`none` modes the token is optional.

### Chat Completions: `POST /v1/chat/completions`

**URL:** `http://localhost:7777/v1/chat/completions`

**Headers:**

- `Content-Type: application/json`
- `Authorization: Bearer YOUR_TOKEN`

**Request Body:**

```json
{
  "model": "gpt-5.6",
  "messages": [
    {"role": "user", "content": "Hello, how are you?"}
  ],
  "stream": true
}
```

**Request fields the server reads:** `model`, `messages`, `stream`, `tools`,
`temperature`, `top_p`, `max_tokens`, `presence_penalty`, and
`frequency_penalty`. Other OpenAI fields are ignored. Messages can have the
roles `system`, `user`, `assistant`, and `tool`, and assistant messages can
carry `tool_calls`. `stream` defaults to `false`.

**Provider selection.** The server picks the provider from the model name:
`gpt-*`, `o1*`, and `o3*` go to OpenAI, `claude-*` goes to Anthropic, and
everything else goes to Ollama at `OLLAMA_API_URL`. The OpenAI and Anthropic keys
come from the caller's stored secrets (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).
A request without `model` uses `llama3.2:latest`.

**Responses.** Without streaming, the reply is a `chat.completion` object whose
`finish_reason` is `stop` or `tool_calls`. With `"stream": true` the reply is
`text/event-stream` of `chat.completion.chunk` objects, ending with a chunk that
carries `finish_reason` and then `data: [DONE]`. A failure while streaming is
sent as an `error` event object followed by `[DONE]`. `usage` is always zeros,
because the endpoint does not count tokens.

Errors use the OpenAI shape, `{ "error": { "message", "type", "param", "code" } }`.
An unparsable body is a `400`, and a provider that cannot start or a failed
non-streaming call is a `500` with type `server_error`.

**Example using OpenAI Python client:**

```python
import openai

client = openai.OpenAI(
    api_key="YOUR_TOKEN",
    base_url="http://localhost:7777/v1"
)

response = client.chat.completions.create(
    model="gpt-5.6",
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

Returns a fixed list in the OpenAI `list` shape. It does not query a provider
and does not reflect which keys are configured. The entries are
`llama3.2:latest`, `gpt-4`, `gpt-4o`, `gpt-4o-mini`, `claude-sonnet-4-20250514`,
and `claude-opus-4-20250514`. A chat request accepts any model name the three
providers know, not only these. For the live catalog, use the
[SDK models route](api-reference.md#listing-models-an-sdk-client-can-use).

```bash
curl http://localhost:7777/v1/models \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## WebSocket API

The `/ws` endpoint streams agent turns with tools. The connection supports both binary (MessagePack) and text (JSON) messages. Authentication can be provided via
`Authorization: Bearer <token>` headers or an `api_key` query parameter.

### WebSocket Example usage

Every message is a `{ command, data }` envelope. A chat turn is the
`chat_message` command, and `thread_id`, `provider`, and `model` are required.
A bare chat payload gets an `invalid_message` error.

```javascript
const socket = new WebSocket("ws://localhost:7777/ws?api_key=YOUR_KEY");
socket.binaryType = "arraybuffer";

socket.onmessage = (event) => {
  const data = msgpack.decode(new Uint8Array(event.data));
  if (data.type === "chunk" && data.content_type === "text") {
    console.log(data.content);
  }
};

socket.onopen = () => {
  socket.send(
    msgpack.encode({
      command: "chat_message",
      data: {
        thread_id: "my-thread",
        role: "user",
        content: "Hello world",
        provider: "openai",
        model: "gpt-5-mini"
      }
    })
  );
};
```

The server saves the user message to the thread, then streams the turn.
Replies are binary MessagePack by default. Send `set_mode` with `"mode": "text"`
first to receive JSON. The [WebSocket API](websocket-api.md#chat_message) lists
the other `chat_message` fields.

### Server responses

A turn streams these frames, each tagged with the `thread_id`:

- `chunk` – streamed text from the model (`content_type: "text"`), with `done: true` on the last one and `thinking: true` for reasoning text
- `message` – a persisted assistant or tool message
- `tool_call_update` and `tool_result_update` – a server-side tool call and its result
- `tool_call` – a tool the client owns. Reply with a `tool_result` frame
- `tool_approval_request` – a gated tool call. Reply with `tool_approval_response` and `decision` of `allow`, `allow_for_chat`, or `deny`
- `secret_request` – the model needs a credential. Reply with `secret_request_response`
- `task_update`, `planning_update`, `todo_update` – agent progress
- `error` – the turn failed

Set `workflow_target: "workflow"` on `chat_message` to run a workflow as the
chat agent. That path also streams `job_update` frames. A bare `workflow_id` is only
context and does not start a run.

### Reconnecting to a turn

A turn keeps running if the socket drops. After reconnecting, send
`list_chat_turns` to find running turns, then `resume_chat` with the thread id and
the highest `chat_seq` you received. The server replays the frames you missed.
Send `stop` with the `thread_id` to cancel a turn.

## Errors

HTTP `/v1` errors use `{ "error": { "message", "type", "param": null, "code": null } }`.

| Status | `type` and `message` | Cause |
|---|---|---|
| `401` | `{ "error": "Remote access requires authentication" }` (not the OpenAI shape) | No valid token on a server that requires auth. Supabase and OIDC modes answer `{ "error": "Unauthorized" }` for a missing token |
| `400` | `invalid_request_error`, `Invalid JSON body` | The body is not parsable JSON |
| `500` | `server_error`, `Failed to initialize provider: <reason>` | The provider for the model could not start, for example a missing `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` |
| `500` | `server_error`, the provider's message | A non-streaming call failed |

A failure after a stream has started cannot change the status. The stream carries one `data:` chunk with the same `error` object, then `data: [DONE]`.

On `/ws`, a handshake without a valid token gets HTTP `401` with no body. A frame that fails validation gets `{ "error": "invalid_frame" | "invalid_message" | "invalid_command", ... }`. A `chat_message` without `thread_id` gets `{ "error": "thread_id is required for chat_message command" }`, and `resume_chat` without it gets `{ "error": "thread_id is required for resume_chat command" }`. A failed turn arrives as an `error` frame with the `thread_id`. See [WebSocket API errors](websocket-api.md#errors).
