# Workflow Runner

A lightweight web interface that connects to the NodeTool backend via WebSockets.
It can be served as a static page and is used by the desktop app to display
workflow progress and chat logs during execution.

## Files

- `index.html` – entry point for the runner UI
- `js/workflow-runner.js` – `WorkflowRunner` class handling WebSocket connection and message dispatch
- `js/main.js` – application initialisation, workflow loading and execution orchestration
- `js/ui.js` – DOM helpers for input/output fields, progress bar and result rendering
- `js/graph.js` – SVG-based workflow graph visualisation
- `js/utils.js` – shared utilities (logging, HTML escaping)
- `styles/` – CSS styling for the runner page

Open `index.html` in a browser after starting the NodeTool server to see live
workflow updates.

## WebSocket Protocol

The runner communicates with the NodeTool backend over a single WebSocket
connection. All frames are binary and encoded with [MessagePack](https://msgpack.org/).
The default endpoint is `ws://localhost:7777/ws`.

### Encoding

| Direction | Format |
|-----------|--------|
| Client → Server | MessagePack binary frame |
| Server → Client | MessagePack binary frame |

Both sides encode/decode using the `msgpack5` library (browser) or
`@msgpack/msgpack` (web app). Every message is a map/object with at least a
`type` field that determines how it is handled.

### Connection Lifecycle

1. **Connect** – open a WebSocket to the worker URL (`ws://localhost:7777/ws`).
   Set `binaryType = "arraybuffer"`.
2. **Ready** – the `onopen` event fires; the client can now send commands.
3. **Reconnect** – if the connection drops, the client retries automatically
   after a 5-second delay.
4. **Close** – call `socket.close()` or let the server close the connection.

### Client → Server Commands

All client messages are MessagePack-encoded objects with `command` and `data`
fields.

#### `run_job`

Start a new workflow execution.

```json
{
  "command": "run_job",
  "data": {
    "type": "run_job_request",
    "api_url": "http://localhost:7777/api",
    "workflow_id": "<uuid>",
    "job_type": "workflow",
    "auth_token": "<token>",
    "params": { "<input_name>": "<value>" },
    "job_id": "<uuid>",
    "user_id": "<user_id>",
    "graph": {
      "nodes": [],
      "edges": []
    },
    "explicit_types": false,
    "execution_strategy": "threaded",
    "resource_limits": null
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"run_job_request"` | Constant discriminator |
| `api_url` | `string` | Base URL of the REST API |
| `workflow_id` | `string` | UUID of the workflow to run |
| `job_type` | `string` | Always `"workflow"` for workflow runs |
| `auth_token` | `string` | Bearer token for authentication |
| `params` | `object` | Input parameter values keyed by input name |
| `job_id` | `string \| null` | Optional client-generated UUID to track the job |
| `user_id` | `string` | User identifier |
| `graph` | `object \| null` | Optional graph override (`{ nodes, edges }`) |
| `explicit_types` | `boolean` | When `false`, let the server infer types |
| `execution_strategy` | `string` | `"threaded"` (default) or `"subprocess"` |
| `resource_limits` | `object \| null` | Optional resource constraints |

#### `cancel_job`

Cancel a running job.

```json
{
  "command": "cancel_job",
  "data": {
    "job_id": "<uuid>",
    "workflow_id": "<uuid>"
  }
}
```

#### `pause_job`

Pause a running job.

```json
{
  "command": "pause_job",
  "data": {
    "job_id": "<uuid>",
    "workflow_id": "<uuid>"
  }
}
```

#### `resume_job`

Resume a paused or suspended job.

```json
{
  "command": "resume_job",
  "data": {
    "job_id": "<uuid>",
    "workflow_id": "<uuid>"
  }
}
```

#### `reconnect_job`

Reconnect to an in-flight job (e.g. after a page reload). The server replays
any missed updates.

```json
{
  "command": "reconnect_job",
  "data": {
    "job_id": "<uuid>",
    "workflow_id": "<uuid>"
  }
}
```

#### `stream_input`

Push a value into a streaming input node while a job is running.

```json
{
  "command": "stream_input",
  "data": {
    "job_id": "<uuid>",
    "workflow_id": "<uuid>",
    "input": "<input_name>",
    "value": "<any>",
    "handle": "<handle_name | null>"
  }
}
```

#### `end_input_stream`

Signal that a streaming input is complete.

```json
{
  "command": "end_input_stream",
  "data": {
    "job_id": "<uuid>",
    "workflow_id": "<uuid>",
    "input": "<input_name>",
    "handle": "<handle_name | null>"
  }
}
```

### Server → Client Messages

Every server message contains a `type` field used for dispatch. Messages also
include routing fields (`workflow_id`, `job_id`, or `thread_id`) so the client
can multiplex updates across concurrent workflows.

#### `job_update`

Reports overall job status changes.

```json
{
  "type": "job_update",
  "status": "running",
  "job_id": "<uuid>",
  "workflow_id": "<uuid>",
  "message": "optional status text",
  "error": null,
  "traceback": null,
  "result": null,
  "duration": null,
  "run_state": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `"queued"`, `"running"`, `"completed"`, `"failed"`, `"timed_out"`, `"cancelled"`, `"suspended"`, or `"paused"` |
| `job_id` | `string \| null` | Job UUID |
| `workflow_id` | `string \| null` | Workflow UUID for routing |
| `message` | `string \| null` | Human-readable status message |
| `error` | `string \| null` | Error description on failure |
| `traceback` | `string \| null` | Python traceback on failure |
| `result` | `object \| null` | Final result map on completion |
| `duration` | `number \| null` | Execution duration in seconds |
| `run_state` | `object \| null` | Extended state info (e.g. suspension reason) |

#### `node_update`

Reports per-node status changes during execution.

```json
{
  "type": "node_update",
  "node_id": "<uuid>",
  "node_name": "GenerateImage",
  "node_type": "nodetool.image.Generate",
  "status": "running",
  "error": null,
  "result": null,
  "properties": null,
  "workflow_id": "<uuid>"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `node_id` | `string` | Node UUID |
| `node_name` | `string` | Display name of the node |
| `node_type` | `string` | Fully qualified node type |
| `status` | `string` | `"booting"`, `"starting"`, `"running"`, `"completed"`, or `"error"` |
| `error` | `string \| null` | Error message if the node failed |
| `result` | `object \| null` | Node output on completion |
| `properties` | `object \| null` | Updated node properties |
| `workflow_id` | `string \| null` | Workflow UUID for routing |

#### `node_progress`

Reports progress for long-running nodes (e.g. image generation steps).

```json
{
  "type": "node_progress",
  "node_id": "<uuid>",
  "progress": 3,
  "total": 20,
  "chunk": "",
  "workflow_id": "<uuid>"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `node_id` | `string` | Node UUID |
| `progress` | `number` | Current step |
| `total` | `number` | Total steps |
| `chunk` | `string` | Optional text chunk for streaming output |
| `workflow_id` | `string \| null` | Workflow UUID for routing |

#### `output_update`

Delivers a final output value from an output node.

```json
{
  "type": "output_update",
  "node_id": "<uuid>",
  "node_name": "ImageOutput",
  "output_name": "image",
  "value": { "type": "image", "data": "<binary>" },
  "output_type": "image",
  "metadata": {},
  "workflow_id": "<uuid>"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `node_id` | `string` | Node UUID |
| `node_name` | `string` | Display name |
| `output_name` | `string` | Name of the output handle |
| `value` | `any` | The output value (see [Value Types](#value-types)) |
| `output_type` | `string` | Type descriptor (e.g. `"image"`, `"string"`) |
| `metadata` | `object` | Additional metadata |
| `workflow_id` | `string \| null` | Workflow UUID for routing |

#### `preview_update`

Delivers an intermediate preview value during execution.

```json
{
  "type": "preview_update",
  "node_id": "<uuid>",
  "value": { "type": "image", "data": "<binary>" }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `node_id` | `string` | Node UUID |
| `value` | `any` | Preview data (see [Value Types](#value-types)) |

#### `edge_update`

Reports data flow status on a connection between nodes.

```json
{
  "type": "edge_update",
  "workflow_id": "<uuid>",
  "edge_id": "<edge_id>",
  "status": "active",
  "counter": 5
}
```

| Field | Type | Description |
|-------|------|-------------|
| `workflow_id` | `string` | Workflow UUID |
| `edge_id` | `string` | Edge identifier |
| `status` | `string` | Edge status |
| `counter` | `number \| null` | Number of items that have passed through |

#### `log_update`

Streams log output from a running node.

```json
{
  "type": "log_update",
  "node_id": "<uuid>",
  "node_name": "RunModel",
  "content": "Loading model weights...",
  "severity": "info",
  "workflow_id": "<uuid>"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `node_id` | `string` | Node UUID |
| `node_name` | `string` | Display name |
| `content` | `string` | Log text |
| `severity` | `string` | `"info"`, `"warning"`, or `"error"` |
| `workflow_id` | `string \| null` | Workflow UUID for routing |

#### `notification`

Server-initiated notification to display to the user.

```json
{
  "type": "notification",
  "node_id": "<uuid>",
  "content": "GPU memory low",
  "severity": "warning",
  "workflow_id": "<uuid>"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `node_id` | `string` | Originating node UUID |
| `content` | `string` | Notification text |
| `severity` | `string` | `"info"`, `"warning"`, or `"error"` |
| `workflow_id` | `string \| null` | Workflow UUID for routing |

#### `planning_update`

Reports agent planning phases.

```json
{
  "type": "planning_update",
  "phase": "analyzing",
  "status": "running",
  "node_id": "<uuid>",
  "content": "Determining approach...",
  "workflow_id": "<uuid>"
}
```

#### `task_update`

Reports agent task progress.

```json
{
  "type": "task_update",
  "task": { "...task object..." },
  "event": "started",
  "node_id": "<uuid>",
  "workflow_id": "<uuid>"
}
```

#### `tool_call_update`

Reports when an agent node invokes a tool.

```json
{
  "type": "tool_call_update",
  "name": "web_search",
  "args": { "query": "example" },
  "node_id": "<uuid>",
  "tool_call_id": "<id>",
  "workflow_id": "<uuid>"
}
```

#### `tool_result_update`

Delivers the result of a tool call.

```json
{
  "type": "tool_result_update",
  "node_id": "<uuid>",
  "result": { "...result data..." },
  "workflow_id": "<uuid>"
}
```

#### `prediction`

Reports prediction/inference status from an external provider.

```json
{
  "type": "prediction",
  "id": "<prediction_id>",
  "node_id": "<uuid>",
  "status": "running",
  "user_id": "<user>",
  "workflow_id": "<uuid>",
  "logs": "Downloading model...",
  "error": null,
  "duration": null
}
```

#### `chunk`

Streams incremental text/media content from a node.

```json
{
  "type": "chunk",
  "content": "Hello ",
  "content_type": "text",
  "content_metadata": {},
  "done": false,
  "thinking": false,
  "node_id": "<uuid>",
  "workflow_id": "<uuid>"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `content` | `string` | Content fragment |
| `content_type` | `string` | `"text"`, `"audio"`, `"image"`, `"video"`, or `"document"` |
| `content_metadata` | `object` | Extra metadata for the content |
| `done` | `boolean` | `true` on the final chunk |
| `thinking` | `boolean` | `true` when the model is in reasoning/thinking mode |
| `node_id` | `string \| null` | Node UUID |
| `workflow_id` | `string \| null` | Workflow UUID for routing |

### Value Types

Output and preview values are typically objects with a `type` discriminator:

| Type | Shape | Description |
|------|-------|-------------|
| Image | `{ "type": "image", "data": <binary> }` | Raw image bytes (PNG) |
| Audio | `{ "type": "audio", "data": <binary> }` | Raw audio bytes (MP3/WAV) |
| Video | `{ "type": "video", "data": <binary> }` | Raw video bytes (MP4) |
| Text | `"plain string"` | Simple string value |
| Number | `42` or `3.14` | Numeric value |
| Boolean | `true` / `false` | Boolean value |
| Object | `{ ... }` | Arbitrary JSON-like object |

Binary data in MessagePack frames is transmitted as raw byte arrays, avoiding
Base64 overhead.

### Message Routing

The server tags each message with one or more routing keys:

- `workflow_id` – primary key for workflow execution updates.
- `job_id` – fallback when `workflow_id` is not present.
- `thread_id` – used for chat/conversation streams.

The `GlobalWebSocketManager` in the main web app multiplexes a single
connection and dispatches messages to per-workflow handlers based on these keys.
The standalone workflow runner uses a simpler approach, handling all messages in
a single callback.

### Typical Message Sequence

```
Client                              Server
  |                                   |
  |--- run_job ---------------------->|
  |                                   |
  |<------------- job_update (queued) |
  |<------------ job_update (running) |
  |                                   |
  |<---- node_update (node A running) |
  |<--- node_progress (node A 1/10)   |
  |<--- node_progress (node A 5/10)   |
  |<-- node_update (node A completed) |
  |                                   |
  |<---- node_update (node B running) |
  |<---------- preview_update (B)     |
  |<-- node_update (node B completed) |
  |                                   |
  |<---------- output_update (final)  |
  |<-------- job_update (completed)   |
  |                                   |
```

### Error Handling

- Connection errors trigger automatic reconnection after 5 seconds.
- A 120-second timeout is applied to each `run_job` call; if no terminal
  `job_update` arrives the promise is rejected.
- Server errors are delivered as `job_update` messages with `status: "failed"`
  and an `error` field, or as standalone `error` type messages.
- Per-node errors arrive via `node_update` with an `error` field set.

### REST API Endpoints

The runner also uses a small set of REST endpoints before starting the
WebSocket flow:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/workflows/` | List available workflows |
| `GET` | `/api/workflows/:id` | Get workflow details, input/output schemas |

Both endpoints require an `Authorization: Bearer <token>` header.
