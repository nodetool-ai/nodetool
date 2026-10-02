---
layout: page
title: "WebSocket API"
description: "Run workflows, stream results, and receive real-time updates over NodeTool's single WebSocket endpoint (MessagePack or JSON)."
---

This document describes the WebSocket API used to run workflows, stream results, and receive real-time updates from the NodeTool backend.

## Overview

NodeTool exposes a single WebSocket endpoint for workflow execution and live updates. Clients connect once and multiplex commands and responses for many concurrent workflows over that connection.

- **Endpoint**: `ws(s)://<host>/ws`
- **Auth**: Send `Authorization: Bearer <token>` on the handshake (preferred) or append `?api_key=<token>` to the URL. Tokens are optional in `local`/`none` auth modes. The connection's identity comes from the handshake. A `run_job` frame needs no token of its own.
- **Protocol**: Binary (MessagePack) or Text (JSON) frames. The server decodes either kind of inbound frame. Outbound frames are binary until the client sends [`set_mode`](#set_mode).

See [`examples/workflow_runner/js/workflow-runner.js`](https://github.com/nodetool-ai/nodetool/blob/main/examples/workflow_runner/js/workflow-runner.js) for a complete client implementation used by the bundled runner UI.

## Encoding

The protocol supports two encoding modes on the same connection:

| Mode | Frame type | When to use |
|------|-----------|-------------|
| **Binary** (default) | Binary WebSocket frame | MessagePack-encoded. Preferred for production use — compact format and native binary data (images, audio) without Base64 overhead. |
| **Text** | Text WebSocket frame | JSON-encoded. Useful for debugging, `curl`/`websocat` testing, and lightweight clients that don't need binary payloads. |

Binary frames are decoded with MessagePack and text frames as JSON, whichever
the client sends. The format of the server's replies does not follow the
client's frames. A new connection receives binary frames, and a client that
wants JSON text frames sends [`set_mode`](#set_mode) with `"mode": "text"`
first. Every server message is a map/object. Most carry a `type` field, but the
acknowledgements described under [Command replies](#command-replies) do not.

Limits on one connection:

| Limit | Default | Setting |
|---|---|---|
| Inbound frame size | 256 MiB | `NODETOOL_WS_MAX_MESSAGE_BYTES`. An oversized frame is answered with an `invalid_frame` error and the connection stays open |
| Inbound message rate | 200 messages per 1000 ms | `NODETOOL_WS_RATE_LIMIT_MAX`, `NODETOOL_WS_RATE_LIMIT_WINDOW_MS`, `NODETOOL_WS_RATE_LIMIT_DISABLED`. The socket closes with code 1008 |
| Undelivered inbound frames | 2000 | `NODETOOL_WS_MAX_QUEUED_FRAMES`. The socket closes with code 1008 |
| Protocol ping interval | 20000 ms | `NODETOOL_WS_PING_INTERVAL_MS` |
| Silence before the peer is dropped | 70000 ms | `NODETOOL_WS_IDLE_TIMEOUT_MS` |
| Unsent outbound bytes before sends wait | 8388608 | `NODETOOL_WS_MAX_BUFFERED_BYTES`, `NODETOOL_WS_DRAIN_TIMEOUT_MS` (30000 ms) |

`NODETOOL_WS_HEALTH_DISABLED` turns off the ping and idle checks.

## Connection Lifecycle

1. **Connect** — open a WebSocket to `ws://<host>/ws` (or `wss://` for TLS).
   For binary mode set `binaryType = "arraybuffer"`.
2. **Ready** — the `onopen` event fires; the client can now send commands.
3. **Heartbeat** — the server sends `{"type": "ping", "ts": <seconds>}` every
   25 seconds. A client may send `{"type": "ping"}` at any time and receives
   `{"type": "pong", "ts": <seconds>}`. A client `pong` is accepted and ignored.
4. **Reconnect** — if the connection drops, retry. The web app backs off
   exponentially from 1 s to a 30 s ceiling with no attempt cap. The bundled
   workflow runner example retries every 5 s.
5. **Close** — call `socket.close()` or let the server close the connection.

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

Commands use a `command` and `data` envelope. An optional `request_id` string
is echoed back by the RPC commands. A frame with a `command` the server does not
implement is answered with `{"error": "Unknown command"}`.

```json
{ "command": "<name>", "data": { }, "request_id": "<optional>" }
```

| Command | Purpose |
|---|---|
| [`run_job`](#run_job) | Start a workflow run |
| [`cancel_job`](#cancel_job) | Cancel a run |
| [`reconnect_job`](#reconnect_job) | Reattach to a run and replay missed frames |
| [`stream_input`](#stream_input), [`end_input_stream`](#end_input_stream) | Feed a streaming input node |
| [`update_node_properties`](#update_node_properties) | Change node properties on a live run |
| [`get_status`](#get_status) | Report active runs |
| [`set_mode`](#set_mode) | Choose binary or text frames |
| [`clear_models`](#clear_models) | Unload cached models |
| [`chat_message`](#chat_message), [`resume_chat`](#resume_chat), [`list_chat_turns`](#list_chat_turns), [`set_permission_mode`](#set_permission_mode) | Chat turns, see [Chat API](chat-api.md) |
| [`inference`](#inference), [`stop`](#stop) | Direct streaming inference and stopping work |
| [RPC commands](#rpc-commands) | `list_workflows`, `get_workflow`, `list_assets`, `get_asset`, `list_nodes`, `get_node`, `generate_media`, `generate_text`, `transcribe_audio`, `lookup_generations` |

A deployed app's visitor reaches this socket through a scoped session and can
use only `run_job`, `reconnect_job`, `cancel_job`, `stream_input`,
`end_input_stream`, and `get_status`. Any other command is refused with
`This command is not available for a published app`, and a job command for a
run that does not belong to the app is refused with
`That run does not belong to this app`.

### Command replies

Every command except the RPC commands gets an acknowledgement frame right away.
It has no `type` field. It is either an `error` object or a short status:

```json
{ "message": "Job started", "workflow_id": "<uuid>" }
{ "error": "job_id is required" }
```

The acknowledgement says the command was accepted, not that the work finished.
Results arrive later as the typed messages below. Frames that fail validation
get `{"error": "invalid_frame" | "invalid_message" | "invalid_command", ...}`
with a `message` or `details` string. A non-command frame without a `type` the
server knows is answered with `invalid_message`.

### `run_job`

Start a new workflow execution.

```json
{
  "command": "run_job",
  "data": {
    "workflow_id": "<uuid>",
    "params": { "<input_name>": "<value>" },
    "job_id": "<uuid>",
    "job_name": "Nightly render",
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
| `workflow_id` | `string` | UUID of the saved workflow to run. Omit it when `graph` carries the whole run |
| `params` | `object` | Input parameter values keyed by input name |
| `job_id` | `string \| null` | Optional client-generated id. The server generates one when it is absent |
| `job_name` | `string \| null` | Title stored on the job row |
| `user_id` | `string` | User the run is recorded under. Defaults to the connection's user |
| `graph` | `object \| null` | Optional graph override (`{ nodes, edges }`). A malformed graph is rejected with `invalid_command` |
| `concurrent` | `boolean` | Let this run start while the same workflow already has a run in flight. Without it a workflow runs one at a time |
| `explicit_types` | `boolean` | When `false`, let the server infer types |
| `project_id` | `string \| null` | Project the run belongs to |
| `execution_options` | `object \| null` | `persistence` (`"job"` or `"session"`), `event_detail` (`"full"`, `"outputs"`, or `"terminal"`), `asset_persistence` (`"auto"` or `"temporary"`). Defaults are `job`, `full`, `auto` |
| `require_terminal_result` | `boolean` | SDK opt-in: a `completed` `job_update` counts as terminal only when it carries `result.outputs` |
| `supervise` | `boolean` | Let an LLM supervisor answer node failures. Off unless set. See the [supervisor design](workflow-supervisor-design.md) |
| `supervisor` | `object` | Supervisor options: `provider`, `model`, `max_decisions`, `max_retries_per_node`, `decision_timeout_ms`, `cost_cap_usd`. Ignored unless `supervise` is true |
| `application_id`, `application_version`, `operation_id` | | Set by a mini app run so the server can check the app's spend budget. `application_version` is the released version, absent for a draft |

The server keeps at most `MAX_CONCURRENT_JOBS` runs in flight per connection
(default 4, a setting) and at most one per workflow unless `concurrent` is set
(`MAX_CONCURRENT_RUNS_PER_WORKFLOW`, default 4, caps concurrent runs of one
workflow). A run that has to wait gets a `job_update` with `status: "queued"`
and a 1-based `queue_position`, and starts on its own when a slot frees.

`api_url`, `job_type`, `type`, `execution_strategy`, and `resource_limits`
appear in older clients and in the `RunJobRequest` type. The server reads none
of them. `execution_strategy` is a column on the `jobs` table that nothing
writes, and no threaded, subprocess, or docker execution mode exists. See
[Execution Strategies](execution-strategies.md).

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

Reattach to an in-flight job (for example after a page reload). The server
sends a `job_resumed` header, then replays the frames the client missed.

```json
{
  "command": "reconnect_job",
  "data": {
    "job_id": "<uuid>",
    "workflow_id": "<uuid>",
    "last_seq": 41
  }
}
```

Every frame of a run carries a `job_seq` number. `last_seq` is the highest one
the client already holds, and `0` or an absent value means none. The header
reports what the server holds:

```json
{
  "type": "job_resumed",
  "job_id": "<uuid>",
  "workflow_id": "<uuid>",
  "status": "running",
  "last_seq": 57,
  "replay_count": 16,
  "replay_incomplete": false
}
```

`status` is `"running"` (live frames follow the replay) or `"finished"` (the
replay is the whole tail). `replay_incomplete` is `true` when `last_seq` is older
than the bounded buffer still holds. When no run holds a replayable session, the
server sends a plain `job_update` with the stored outcome instead of the header.

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

Push property changes into the node executors of a running job, for example
synth knobs while a patch plays. `job_id`, `node_id`, and `properties` are
required.

```json
{
  "command": "update_node_properties",
  "data": {
    "job_id": "<uuid>",
    "node_id": "<uuid>",
    "properties": { "<name>": "<value>" }
  }
}
```

The reply is `{ "applied": true }` when a running node took the change and
`{ "applied": false }` when it did not. A miss is not an error, because the
canvas already holds the value for the next run.

### `get_status`

Report active runs on this connection. Without `job_id` the reply lists them.
With one it reports that run.

```json
{ "command": "get_status", "data": { "job_id": "<uuid>" } }
```

```json
{ "status": "running", "job_id": "<uuid>", "workflow_id": "<uuid>" }
{ "status": "not_found", "job_id": "<uuid>" }
{ "active_jobs": [{ "job_id": "<uuid>", "workflow_id": "<uuid>", "status": "running" }] }
```

### `set_mode`

Choose the frame format for everything the server sends on this connection.
`mode` is `"binary"` (MessagePack, the default) or `"text"` (JSON). Any other
value gets `{ "error": "mode must be binary or text" }`.

```json
{ "command": "set_mode", "data": { "mode": "text" } }
```

### `clear_models`

Accepted for compatibility. The server replies with a message and unloads
nothing, because model lifetime belongs to the provider implementations.

```json
{ "command": "clear_models", "data": {} }
```

### `chat_message`

Start one chat turn on a thread. `thread_id` is required. The server saves the
message, runs the turn, and streams `chunk`, `message`, tool, and approval
frames tagged with the same `thread_id`. The acknowledgement is
`{ "message": "Chat message processing started", "thread_id": "<id>" }`.

```json
{
  "command": "chat_message",
  "data": {
    "thread_id": "<thread-id>",
    "role": "user",
    "content": "Summarize this workflow",
    "provider": "openai",
    "model": "gpt-5-mini",
    "permission_mode": "default"
  }
}
```

A plain chat turn without a `provider` and `model` pair is answered with an
`error` frame before anything is saved. The other fields the turn reads:

| Field | Description |
|---|---|
| `content` | A string or an array of content blocks |
| `workflow_id`, `project_id` | Context for the turn. A bare `workflow_id` does not run the workflow |
| `workflow_target` | `"workflow"` runs the workflow as a chatbot. It also takes `workflow_message_input_name` and `workflow_messages_input_name` |
| `media_generation` | `{ "mode": ... }` where a mode other than `"chat"` produces an image, video, or audio message instead of an LLM reply |
| `permission_mode` | `"plan"`, `"default"` (the fallback), or `"auto"`. Governs whether gated tool calls run, ask, or are blocked |
| `system_prompt` | Extra system prompt text layered after the base prompt |
| `ui_context` | Which documents the user has open and which has focus |

A new `chat_message` on a thread supersedes a turn still running there. Turns
are detached from the socket. If the connection drops, the turn keeps running
and the client reattaches with `list_chat_turns` and `resume_chat`.

### `resume_chat`

Reattach to a thread's latest turn. The server sends a `chat_resumed` header and
then the frames after `last_seq`, which is the highest `chat_seq` the client
holds. `0` or an absent value declares a fresh client, and the server then
replays only what the stored thread history cannot provide and sets
`replay_incomplete` so the client reloads history over REST.

```json
{ "command": "resume_chat", "data": { "thread_id": "<thread-id>", "last_seq": 12 } }
```

```json
{
  "type": "chat_resumed",
  "thread_id": "<thread-id>",
  "status": "running",
  "last_seq": 30,
  "replay_count": 18,
  "replay_incomplete": false
}
```

`status` is `"running"`, `"finished"`, or `"unknown"`. `"unknown"` means no turn
is held, either because none ran or because the retention window passed. Fetch
the thread's history instead.

### `list_chat_turns`

Ask which of the caller's turns are still running. The server sends one
`chat_turn_active` frame per turn
(`{ "type": "chat_turn_active", "thread_id": "<id>", "status": "running", "last_seq": 30 }`)
and acknowledges with `{ "message": "Chat turns listed", "count": 1 }`.

### `set_permission_mode`

Change the permission mode of a thread's turn while it runs. `thread_id` and
`permission_mode` (`"plan"`, `"default"`, or `"auto"`) are required. The change
applies to a turn already running, and `"auto"` also approves every approval
request that is waiting on the thread.

```json
{ "command": "set_permission_mode", "data": { "thread_id": "<thread-id>", "permission_mode": "auto" } }
```

### `inference`

Stream one model call with no thread and no saved messages. `data` takes
`provider`, `model` (both default to the server's), `messages` (each with
`role` and `content`), and `tools` (each with `name`, `description`, and
`inputSchema`). The server streams `chunk` frames and `tool_call` frames, each
stamped with a `seq` number, and ends with `{ "type": "inference_done", "seq": n }`.
The acknowledgement is `{ "message": "Inference started" }`.

### `stop`

Stop generation. It cancels the connection's running chat turn or inference,
any pending RPC calls, and the run named by `job_id` or the turn named by
`thread_id`.

```json
{ "command": "stop", "data": { "thread_id": "<thread-id>", "job_id": "<uuid>" } }
```

The server sends `{ "type": "generation_stopped", "message": "Generation stopped by user", "job_id": ..., "thread_id": ... }`
followed by the usual acknowledgement.

### RPC commands

These commands return a single `rpc_response` frame that carries the
`request_id` of the request. `request_id` is required. Without it the reply is
`{ "error": "request_id is required for RPC commands" }`.

| Command | `data` | Result |
|---|---|---|
| `list_workflows` | `limit`, `run_mode`, `tag`, `cursor` | Same as the tRPC `workflows.list` procedure |
| `get_workflow` | `id` | `workflows.get` |
| `list_assets` | `parent_id`, `content_type`, `workflow_id`, `node_id`, `job_id`, `page_size` | `assets.list` |
| `get_asset` | `id` | `assets.get` |
| `list_nodes` | `namespace`, `query`, `fields` (`"summary"` or `"full"`), `limit` | `nodes.list` |
| `get_node` | `node_type` | `nodes.get` |
| `generate_text` | `provider`, `model`, `prompt`, `system`, `messages`, `max_tokens`, `schema`, `schema_name`, `schema_description` | `{ "text": string, "data": object \| null }`. With `schema` the model answers through one forced tool and `data` carries the parsed object |
| `generate_media` | `mode` (`image`, `image_edit`, `inpaint`, `video`, `video_edit`, `video_extend`, `audio`, `music`), `provider`, `model`, `prompt`, plus size, seed, reference, and voice fields | `{ "asset_ids": string[] }`. Creates no thread or message row |
| `transcribe_audio` | `provider`, `model`, `asset_id`, `language` | Transcript of a stored audio asset |
| `lookup_generations` | `request_ids` | `{ "generations": [...] }` with `request_id`, `generation_id`, `status`, `asset_ids`, and `error` for each id that has a row. A client that reloaded mid-render uses it to recover results the closed socket never received |

```json
{
  "type": "rpc_response",
  "request_id": "<id>",
  "command": "get_workflow",
  "result": { }
}
```

On failure the frame carries `error` instead of `result`, with `code`,
`message`, `retryable`, and the optional `apiCode` and `trpcCode`.

### Other client frames

Some frames have no `command` envelope. They answer a request the server sent,
so a client that handles chat or the editor bridge sends them.

| `type` | Answers | Key fields |
|---|---|---|
| `ping` | | Server replies `pong` |
| `tool_result` | `tool_call` | `tool_call_id`, `result` |
| `tool_approval_response` | `tool_approval_request` | `approval_id`, `decision` (`"allow"`, `"allow_for_chat"`, or `"deny"`) |
| `plan_approval_response` | | `approval_id`. Resolves a waiting approval by id. The server sends no plan approval request frame today |
| `secret_request_response` | `secret_request` | `approval_id`, `status` (`"saved"` or `"declined"`). The secret value never travels in this frame |
| `client_tools_manifest` | | `tools`, the frontend tools this editor offers |
| `renderer_tool_result` | `renderer_tool_call` | See [Live Editor Renderer Bridge](#live-editor-renderer-bridge) |

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
  "queue_position": null,
  "validation_issues": null,
  "error_code": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `"queued"`, `"running"`, `"completed"`, `"failed"`, or `"cancelled"` |
| `job_id` | `string \| null` | Job UUID |
| `workflow_id` | `string \| null` | Workflow UUID for routing |
| `message` | `string \| null` | Human-readable status message |
| `error` | `string \| null` | Error description on failure |
| `traceback` | `string \| null` | Stack trace on failure |
| `result` | `object \| null` | Final result map on completion |
| `duration` | `number \| null` | Execution duration in seconds |
| `queue_position` | `number \| null` | 1-based place in the pending-run queue, present with `status: "queued"` |
| `validation_issues` | `array \| null` | Per-property issues from pre-flight graph validation, present when a `failed` run was refused by validation instead of crashing |
| `error_code` | `string \| null` | Machine-readable reason for a `failed` status. `BUDGET_EXCEEDED` means an app's spend budget refused the run |

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
| `status` | `string` | `"running"`, `"completed"`, `"error"`, or `"warning"` |
| `error` | `string \| null` | Error message if the node failed, or the warning text |
| `error_detail` | `object \| null` | Structured cause behind `error`, when the failure has one |
| `result` | `object \| null` | Node output on completion. Constant and input nodes omit it, because the client already holds those values |
| `properties` | `object \| null` | Updated node properties |
| `provider_cost` | `object \| null` | Provider charge for the last completed run, when the node reports one |
| `workflow_id` | `string \| null` | Workflow UUID for routing |
| `job_id` | `string \| null` | Run id, so a client watching several runs can tell them apart |

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
| `job_id` | `string \| null` | Run id |

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
| `disposition` | `"append" \| "replace"` | `append` means `value` is a chunk to add to the live display buffer and `replace` means it is a whole snapshot. Absent means `append` |
| `done` | `boolean` | Marks the last chunk of an append stream |
| `workflow_id` | `string \| null` | Workflow UUID for routing |
| `job_id` | `string \| null` | Run id |

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
| `job_id` | `string \| null` | Run id. Edge animation is scoped per run |
| `status` | `string` | `"active"`, `"completed"`, or `"drained"` (a target handle was left without input when the run ended) |
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
  "step": { "...step object..." },
  "event": "step_started",
  "node_id": "<uuid>",
  "workflow_id": "<uuid>"
}
```

`event` is one of `task_planned`, `task_removed`, `task_created`, `step_started`,
`entered_conclusion_stage`, `step_completed`, `step_failed`, `task_completed`,
or `task_failed`. `step` is absent for task-level events.

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
  "tool_call_id": "<id>",
  "name": "web_search",
  "result": { "...result data..." },
  "is_error": false,
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
| `content_type` | `string` | `"text"`, `"audio"`, `"image"`, `"video"`, `"document"`, `"tool_call"`, or `"agent_status"` |
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

### Other server messages

| `type` | Sent when | Key fields |
|---|---|---|
| `error` | A turn or run failed, or the server refused work (for example while draining) | `message`, `thread_id`, `workflow_id` |
| `generation_complete` | A generator node committed one complete artifact | `node_id`, `node_name`, `node_type`, `outputs`, `index`, `job_id` |
| `save_update` | A node saved a value | `node_id`, `name`, `value`, `output_type`, `metadata` |
| `binary_update` | A node produced raw bytes | `node_id`, `output_name`, `binary` |
| `step_result` | An agent step finished | `step`, `result`, `error`, `is_task_result` |
| `todo_update` | An agent changed its to-do list | `todos` (each with `content` and `status` of `pending`, `in_progress`, or `completed`) |
| `llm_call` | A node made an LLM call | `node_id`, `provider`, `model`, `messages`, `response`, `tool_calls`, `tokens_input`, `tokens_output`, `cost`, `duration_ms`, `error`, `timestamp` |
| `provider_call_failed` | A provider call failed | `provider`, `model`, `operation`, `kind`, `status`, `message`, `request_id`, `duration_ms`, `timestamp` |
| `supervisor_escalation` | A supervised run parked on a failed node | `node_id`, `node_name`, `escalation` |
| `supervisor_decision` | The supervisor answered an escalation | `node_id`, `escalation`, `verdict`, `decided_by`, `cost` |
| `message` | A chat turn persisted a message (assistant or tool) | `role`, `content`, `thread_id`, `tool_calls`, `tool_call_id`, `provider`, `model` |
| `tool_call` | A tool the client owns must run | `thread_id`, `tool_call_id`, `name`, `args`. Answer with a `tool_result` frame. Waits 300 s |
| `tool_approval_request` | A gated tool call needs approval | `thread_id`, `approval_id`, `tool_name`, `category`, `message`, `description`, `args`. Answer with `tool_approval_response` |
| `secret_request` | Sandboxed code needs a credential the install lacks | `thread_id`, `approval_id`, `key`, `description`, `reason`, `help_url`. Answer with `secret_request_response` |
| `generation_stopped` | A `stop` command was processed | `job_id`, `thread_id` |
| `inference_done` | An `inference` call finished | `seq` |
| `job_resumed`, `chat_resumed`, `chat_turn_active` | Replies to `reconnect_job`, `resume_chat`, `list_chat_turns` | See those commands |
| `rpc_response` | Reply to an RPC command | `request_id`, `command`, `result` or `error` |
| `resource_change` | A stored resource changed, from any tab, agent, or CLI call | `event` (`created`, `updated`, or `deleted`), `resource_type`, `resource`, and optional `ops` |
| `ping`, `pong` | Heartbeat | `ts` |
| `sdk_execution_target` | Connection open, when the server runs the SDK execution registry | `runner_id` |

Chat frames carry a `chat_seq` number and workflow frames a `job_seq` number.
Those numbers drive replay after a reconnect.

## Value Types

Output values are plain JSON values or objects with a `type` discriminator.
Image, audio, and video outputs are asset references. The server converts the
bytes before it sends the frame, and the form depends on the connection mode:

| Mode | Asset reference |
|------|-----------------|
| Binary (MessagePack, the default) | `{ "type": "image", "uri": "<temporary URL>" }`. The bytes are uploaded to temporary storage and fetched over HTTP |
| Text (JSON, after `set_mode`) | `{ "type": "image", "uri": "data:image/png;base64,..." }`. The bytes are inline |

The same applies to `audio` and `video`. Other values keep their JSON shape:

| Type | Shape |
|------|-------|
| Text | `"plain string"` |
| Number | `42` or `3.14` |
| Boolean | `true` / `false` |
| Object | `{ ... }` |

Other binary fields (`Uint8Array`) travel as raw byte arrays in MessagePack
frames. In text mode they become arrays of numbers, not Base64. In-process
audio chunks that carry native samples are encoded as base64 `f32le` in both
modes.

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

- A command that fails validation or is refused gets an acknowledgement frame
  with an `error` field. See [Command replies](#command-replies).
- Run failures arrive as `job_update` with `status: "failed"` and an `error`
  field, and chat failures arrive as `error` frames with a `thread_id`.
- Per-node errors arrive via `node_update` with an `error` field set.
- Reconnection is the client's job. The server never reopens a connection.
- The reference client in `examples/workflow_runner` applies a 120-second
  timeout to each `run_job` call and rejects the promise if no terminal
  `job_update` arrives.

## Other WebSocket Endpoints

### `/ws/extension`

The browser extension attaches to a tab through this endpoint, and the
in-process browser agent drives the tab over it. Frames are JSON text, not
MessagePack. The server keeps one extension socket, and a new connection
replaces the old one. The endpoint has no authentication of its own beyond the
server's global handshake rules, so anyone who can connect can proxy
Chrome DevTools Protocol calls through the server. It is disabled when
`NODETOOL_ENV=production` unless `NODETOOL_ENABLE_EXTENSION_BRIDGE=1`.

### `/ws/download`

Model downloads. The endpoint exists only when `NODETOOL_ENV` is not
`production`. Frames are JSON text in both directions.

```json
{ "command": "start_download", "repo_id": "<hf-repo>", "path": null, "model_type": null }
{ "command": "cancel_download", "repo_id": "<hf-repo>" }
```

`start_download` also takes `allow_patterns`, `ignore_patterns`, `cache_dir`, and
`scope`. A `scope` of `"worker"` relays the download to a connected worker. A
`model_type` that starts with `tjs.` downloads a Transformers.js model. The
server streams progress frames until the download ends:

```json
{
  "status": "progress",
  "repo_id": "<hf-repo>",
  "path": null,
  "model_type": null,
  "downloaded_bytes": 1048576,
  "total_bytes": 4194304,
  "downloaded_files": 0,
  "current_files": ["model.safetensors"],
  "total_files": 3
}
```

`status` is `"idle"`, `"start"`, `"progress"`, `"completed"`, `"cancelled"`, or
`"error"`. An error frame carries an `error` string. A protocol failure is sent
as `{ "status": "error", "error": "<message>" }`. For REST-style downloads see
[Downloading a Model over the SDK Routes](api-reference.md#downloading-a-model-over-the-sdk-routes).

## Quick Start Examples

### Binary mode (MessagePack)

```javascript
// Add ?api_key=YOUR_TOKEN when the server enforces auth
const socket = new WebSocket("ws://localhost:7777/ws");
socket.binaryType = "arraybuffer";

socket.onopen = () => {
  socket.send(
    msgpack.encode({
      command: "run_job",
      data: {
        workflow_id: "YOUR_WORKFLOW_ID",
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
  // Replies are binary until the client asks for text
  socket.send(JSON.stringify({ command: "set_mode", data: { mode: "text" } }));
  socket.send(
    JSON.stringify({
      command: "run_job",
      data: {
        workflow_id: "YOUR_WORKFLOW_ID",
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
