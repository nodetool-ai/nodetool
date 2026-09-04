---
layout: page
title: "WebSocket API"
description: "Run workflows, stream results, and receive real-time updates over NodeTool's single WebSocket endpoint (MessagePack or JSON)."
---

This document describes the WebSocket API used to run workflows, stream results, and receive real-time updates from the NodeTool backend.

## Overview

NodeTool exposes a single WebSocket endpoint for workflow execution and live updates. Clients connect once and multiplex commands and responses for many concurrent workflows over that connection.

- **Endpoint**: `ws(s)://<host>/ws`
- **Auth**: Include a bearer token as a query parameter (`?api_key=<token>`) or rely on the same auth flow used by REST endpoints. Tokens are optional in `local`/`none` auth modes.
- **Protocol**: Binary (MessagePack) or Text (JSON) frames. The server auto-detects frame type.

See [`examples/workflow_runner/js/workflow-runner.js`](https://github.com/nodetool-ai/nodetool/blob/main/examples/workflow_runner/js/workflow-runner.js) for a complete client implementation used by the bundled runner UI.

## Encoding

The protocol supports two encoding modes on the same connection:

| Mode | Frame type | When to use |
|------|-----------|-------------|
| **Binary** (default) | Binary WebSocket frame | MessagePack-encoded. Preferred for production use — compact format and native binary data (images, audio) without Base64 overhead. |
| **Text** | Text WebSocket frame | JSON-encoded. Useful for debugging, `curl`/`websocat` testing, and lightweight clients that don't need binary payloads. |

Binary frames are decoded with MessagePack; text frames are decoded as JSON.
Both modes are interchangeable — the server accepts either and responds in the
same format. Every message is a map/object with at least a `type` field.

## Connection Lifecycle

1. **Connect** — open a WebSocket to `ws://<host>/ws` (or `wss://` for TLS).
   For binary mode set `binaryType = "arraybuffer"`.
2. **Ready** — the `onopen` event fires; the client can now send commands.
3. **Reconnect** — if the connection drops, retry with exponential backoff (the
   reference client retries up to 10 times starting at 1 s).
4. **Close** — call `socket.close()` or let the server close the connection.

## Live Editor Renderer Bridge

The web editor can execute `ui_*` tools for an MCP client through this same
`/ws` connection. It does not open a second agent socket and it does not create
a chat thread.

The bridge uses these connection-level messages:

| Direction | Type | Purpose |
|---|---|---|
| Server → editor | `renderer_registered` | Assign an ID to this editor connection. |
| Editor → server | `client_tools_manifest` | Advertise the frontend tools available in this editor. |
| Server → editor | `renderer_tool_call` | Ask the editor to execute one advertised tool. |
| Editor → server | `renderer_tool_result` | Return the result or a structured error. |

The server keeps a user-scoped registry of ready editors. An MCP `ui_*` call
can include `renderer_id` to select one editor. If it omits the ID, the server
uses that user's most recently active editor. The `list_renderers` CodeAct belt
tool returns the available IDs. A disconnected editor is removed immediately.

The normal MessagePack or JSON encoding rules apply. These frames do not use
the `{ command, data }` envelope.

```json
{
  "type": "renderer_tool_call",
  "renderer_id": "<renderer-id>",
  "tool_call_id": "<call-id>",
  "name": "ui_get_graph",
  "args": {}
}
```

```json
{
  "type": "renderer_tool_result",
  "renderer_id": "<renderer-id>",
  "tool_call_id": "<call-id>",
  "ok": true,
  "result": { "nodes": [], "edges": [] },
  "elapsed_ms": 12
}
```

## Multi-Instance Deployments

A run's replay buffer and its cancel/stream hooks live in the one server
process executing it, so on a deployment with more than one instance both
`reconnect_job` and `cancel_job` have to reach that process. Two environment
variables drive this, and with neither set the whole mechanism is inert:

- `NODETOOL_INSTANCE_ID` — this instance's identity.
- `FLY_MACHINE_ID` — the fallback, set by Fly on every machine. It is also the
  value `fly-replay: instance=<id>` addresses.

The instance executing a run stamps its id on the job row (`runner_instance`).
Two things follow.

**Resuming lands on the owner.** A reconnecting client appends
`?resume_job=<job_id>` to the handshake URL. If that job is non-terminal and
owned by another instance, the server answers the upgrade with
`fly-replay: instance=<owner>` instead of accepting it, and Fly's proxy
re-issues the whole handshake there. A request the proxy already replayed
(`fly-replay-src` present) is never replayed again, so this cannot ping-pong.
The hint names one job — with runs in flight on several instances the rest
reconnect wherever they land and fall back to `reconnect_job`'s persisted-row
answer: the right status, without the replayed frames.

The client retires the hint after two consecutive failed connects, so the third
attempt goes out bare. Without that, a deploy that retires the owning machine
while its row still reads `running` would have every reconnect replayed at a
machine that no longer exists — and since the browser shares one socket across
chat and every other consumer, all of them would stay dark. A successful
connect resets the count.

**Cancel travels through the row.** `cancel_job` for a run this process does
not hold, whose row names a *different* instance, marks the row cancelled with
a conditional update — only while it is still non-terminal, so it cannot
overwrite the owner's own outcome. Every instance re-reads its own running
runs on a timer (`NODETOOL_JOB_CANCEL_POLL_MS`, default 15000, `0` disables)
and cancels any whose row now reads `cancelled`: one indexed query per tick,
bounded by that instance's concurrency.

The row is the only transport, so a cross-instance cancel takes up to a poll
interval to land — the trade for having exactly one signal, the durable one. A
cancel on the machine that *does* hold the run does not go through any of this;
it reaches the session's hooks directly and is immediate.

A row with no `runner_instance` (an HTTP, trigger, or MCP run — nothing holds a
session for those anywhere) is left alone and still answers "Job not found or
already completed".

### Draining

A restart is what a detachable turn does not survive: the process goes away
with the turn's unwritten transcript rows and its unflushed spans. So a machine
is drained before it is restarted.

**SIGUSR2 starts the drain**, with no deadline of its own. From then on:

- `/health` answers 503 with `status: "draining"`, so the proxy stops routing
  new clients here. The payload always carries `turns` and `jobs` — the counts
  of chat turns and workflow runs this process is still executing — whether it
  is draining or not, so a poller can read them either way. `/ready` is
  unchanged.
- A new `/ws` handshake is refused with 503; the client's reconnect backoff
  carries it to a machine that is staying.
- A connection with nothing in flight is closed with **1012** (service
  restart). One driving a turn or a run is closed when that settles.
- `chat_message` and `run_job` answer an `error` frame, and the socket closes
  under the rule above. The refusal comes before the user message is
  persisted, so the client's retry on the other machine is the only copy.

`scripts/fly-rolling-deploy.sh` is the caller: it signals one machine, polls its
`/health` until `turns` and `jobs` are both 0, replaces it, waits for it to
answer 200, and only then moves to the next.

**SIGTERM is the fallback**, for a restart nobody drained. It starts the same
drain, aborts every running turn with the reason `shutdown` and cancels every
running run, then waits up to `NODETOOL_SHUTDOWN_GRACE_MS` (default 240000, under
Fly's 300 s cap) for them to settle before flushing telemetry and exiting. A
turn aborted this way writes `Stopped: server restarting` into its thread — the
one abort the user did not ask for, and so the one that says so.

## Client → Server Commands

All client messages contain `command` and `data` fields.

### `run_job`

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
    "explicit_types": false
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
| `execution_strategy` | `string \| null` | Recorded on the `jobs` row and otherwise unused. Nothing on the run path reads it — there is no threaded/subprocess/docker execution mode. See [Execution Strategies](execution-strategies.md) |
| `resource_limits` | `object \| null` | Declared on `RunJobRequest`, but no runtime enforces it today |

### `cancel_job`

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

### `reconnect_job`

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

### `stream_input`

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

### `end_input_stream`

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

### `update_node_properties`

Update a node's properties on a running or pending job.

```json
{
  "command": "update_node_properties",
  "data": {
    "job_id": "<uuid>",
    "workflow_id": "<uuid>",
    "node_id": "<uuid>",
    "properties": { "<name>": "<value>" }
  }
}
```

### `clear_models`

Ask the server to unload cached models and free memory.

```json
{
  "command": "clear_models",
  "data": {}
}
```

## Server → Client Messages

Every server message contains a `type` field used for dispatch. Messages also
include routing fields (`workflow_id`, `job_id`, or `thread_id`) so the client
can multiplex updates across concurrent workflows.

### `job_update`

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
| `status` | `string` | `"queued"`, `"running"`, `"completed"`, `"failed"`, or `"cancelled"` |
| `job_id` | `string \| null` | Job UUID |
| `workflow_id` | `string \| null` | Workflow UUID for routing |
| `message` | `string \| null` | Human-readable status message |
| `error` | `string \| null` | Error description on failure |
| `traceback` | `string \| null` | Python traceback on failure |
| `result` | `object \| null` | Final result map on completion |
| `duration` | `number \| null` | Execution duration in seconds |
| `run_state` | `object \| null` | Extended state info (e.g. suspension reason) |

### `node_update`

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

### `node_progress`

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

### `output_update`

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

### `edge_update`

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

### `log_update`

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

### `notification`

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

### `planning_update`

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

### `task_update`

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

### `tool_call_update`

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

### `tool_result_update`

Delivers the result of a tool call.

```json
{
  "type": "tool_result_update",
  "node_id": "<uuid>",
  "result": { "...result data..." },
  "workflow_id": "<uuid>"
}
```

### `prediction`

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

### `chunk`

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

### `system_stats`

Reports the **server's** CPU and memory load. Unlike every message above, this
is not tied to a run: the server samples on a wall-clock cadence and pushes to
every connected socket — one frame ~1s after connect (long enough for the CPU
delta to mean something), then every 5s — whether or not a workflow is running.
Clients that record a run's frame stream should drop it as connection control,
alongside `ping`/`pong` and `resource_change`.

A server that enforces auth (`SUPABASE_URL` + `SUPABASE_KEY` — a shared
deployment) sends this message never: its CPU and RAM belong to a container the
user does not own. Clients must render the readout only once a frame arrives.

```json
{
  "type": "system_stats",
  "stats": {
    "cpu_percent": 23.4,
    "memory_percent": 61.2,
    "memory_used": 10522669056,
    "memory_total": 17179869184,
    "memory_used_gb": 9.8,
    "memory_total_gb": 16.0
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `cpu_percent` | `number` | Whole-machine CPU use, 0–100, from the delta since the previous sample |
| `memory_percent` | `number` | Used memory as a percentage of total |
| `memory_used` / `memory_total` | `number` | Bytes |
| `memory_used_gb` / `memory_total_gb` | `number` | The same figures in GB |
| `vram_total_gb` / `vram_used_gb` | `number \| null` | Present only when the host samples a GPU; the default sampler omits them |

## Value Types

Output values are typically objects with a `type` discriminator:

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
Base64 overhead. In JSON/text mode, binary payloads are Base64-encoded strings.

## Message Routing

The server tags each message with one or more routing keys:

- `workflow_id` — primary key for workflow execution updates.
- `job_id` — fallback when `workflow_id` is not present.
- `thread_id` — used for chat/conversation streams.

The `GlobalWebSocketManager` in the main web app multiplexes a single
connection and dispatches messages to per-workflow handlers based on these keys.
The standalone workflow runner uses a simpler approach, handling all messages in
a single callback.

## Typical Message Sequence

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
  |<-------------- output_update (B)  |
  |<-- node_update (node B completed) |
  |                                   |
  |<---------- output_update (final)  |
  |<-------- job_update (completed)   |
  |                                   |
```

## Error Handling

- Connection errors trigger automatic reconnection with exponential backoff.
- A 120-second timeout is applied to each `run_job` call; if no terminal
  `job_update` arrives the promise is rejected.
- Server errors are delivered as `job_update` messages with `status: "failed"`
  and an `error` field, or as standalone `error` type messages.
- Per-node errors arrive via `node_update` with an `error` field set.

## Quick Start Examples

### Binary mode (MessagePack)

```javascript
const socket = new WebSocket("ws://localhost:7777/ws");
socket.binaryType = "arraybuffer";

socket.onopen = () => {
  socket.send(
    msgpack.encode({
      command: "run_job",
      data: {
        type: "run_job_request",
        workflow_id: "YOUR_WORKFLOW_ID",
        auth_token: "YOUR_TOKEN",
        job_type: "workflow",
        params: { prompt: "hello world" }
      }
    })
  );
};

socket.onmessage = (event) => {
  const data = msgpack.decode(new Uint8Array(event.data));
  console.log(data.type, data);
};
```

### Text mode (JSON)

```javascript
const socket = new WebSocket("ws://localhost:7777/ws");

socket.onopen = () => {
  socket.send(
    JSON.stringify({
      command: "run_job",
      data: {
        type: "run_job_request",
        workflow_id: "YOUR_WORKFLOW_ID",
        auth_token: "YOUR_TOKEN",
        job_type: "workflow",
        params: { prompt: "hello world" }
      }
    })
  );
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.type, data);
};
```
