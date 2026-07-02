---
layout: page
title: "Python Bridge Protocol"
description: "How NodeTool talks to the Python worker over stdio using length-prefixed MessagePack frames."
---

NodeTool runs Python nodes and local-compute providers in a separate Python worker process. The desktop app and server spawn that worker and communicate with it over a **local stdio RPC protocol**.

## Why this protocol exists

NodeTool uses Python for:

- Python node execution
- local ML providers such as MLX and HuggingFace
- media processing and model-specific dependencies

The TypeScript runtime uses stdio instead of a localhost socket for the worker because it is simpler to supervise, avoids port-management issues, and keeps the worker strictly parent-scoped.

## Transport

- Parent process spawns: `python -m nodetool.worker --stdio`
- `stdin` / `stdout`: binary protocol traffic
- `stderr`: worker logs and startup diagnostics

### Framing

Each message is encoded as:

```text
[4-byte big-endian payload length][MessagePack payload]
```

The payload is a MessagePack object with this envelope shape:

```json
{
  "type": "discover",
  "request_id": "uuid-or-null",
  "data": {}
}
```

## Lifecycle

1. TypeScript spawns the worker
2. Python loads node packages and providers
3. Python prints `NODETOOL_STDIO_READY` on `stderr`
4. TypeScript sends `discover`
5. Python responds with node metadata, protocol version, and any load errors
6. TypeScript optionally requests `worker.status`
7. Workflow execution uses `execute` / `execute.stream`, `cancel`, `provider.*`, and (on v2+ workers) `models.*` messages

## Message types

### `discover`

Returns the worker's executable node inventory.

Response data:

- `protocol_version`
- `nodes`
- `load_errors`

Example:

```json
{
  "type": "discover",
  "request_id": "d1",
  "data": {
    "protocol_version": 1,
    "nodes": [...],
    "load_errors": [
      {
        "module": "nodetool.nodes.mlx.text_generation",
        "phase": "module_import",
        "error": "No module named 'mlx_lm'",
        "error_type": "ModuleNotFoundError"
      }
    ]
  }
}
```

### `worker.status`

Returns a structured worker health snapshot.

Response data:

- `protocol_version`
- `node_count`
- `provider_count`
- `namespaces`
- `load_errors`
- `transport`
- `max_frame_size`

### `execute`

Executes a Python node.

Request data:

- `node_type`
- `fields`
- `secrets`
- `blobs`

Possible response types:

- `progress`
- `result`
- `error`

### `execute.stream`

Executes a Python node that streams results. Same request data as `execute`
(`node_type`, `fields`, `secrets`, `blobs`), but the worker emits zero or more
`chunk` messages (each carrying partial `outputs`/`blobs`) followed by a
terminal `result` or `error`.

### `cancel`

Requests cooperative cancellation for an in-flight `execute` or streaming provider request.

### `provider.*`

Used for Python-only providers. The message families the TS bridge implements:

- `provider.list`
- `provider.models`
- `provider.generate`
- `provider.stream`
- `provider.text_to_image`
- `provider.image_to_image`
- `provider.tts`
- `provider.asr`
- `provider.embedding`

Streaming providers (`provider.stream`, `provider.tts`) emit zero or more `chunk` messages followed by a terminal `result` or `error`.

### `models.*`

Worker model management (HuggingFace cache). These were introduced in bridge
protocol **v2** and are gated by `supportsModelManagement()` — a v1 worker
simply does not expose them (see [Versioning](#versioning)).

- `models.list_cached` — list models cached on the worker's `HF_HOME` (cache-only, no network)
- `models.download` — download a model onto the worker cache, streaming ordered `progress` frames then a terminal `result`
- `models.delete` — delete a cached model; returns whether it existed

### `comfy.*`

ComfyUI proxy. Introduced in bridge protocol **v3**, gated by `supportsComfy()`
— a worker offers these only when it fronts a co-located, loopback-only ComfyUI
server AND reports `worker.status.comfy.enabled: true`. Route `comfy.*` requests
only to such workers. The full field-level reference lives in
`docs/comfy-proxy.md` in nodetool-core.

- `comfy.execute` — submit an API-format workflow; streams its lifecycle as
  dedicated `comfy.event` frames (see below), then a terminal `result`/`error`.
  Cancel with the standard `cancel` frame.
- `comfy.queue` — `{queue_running, queue_pending}`
- `comfy.interrupt` — global stop of the running job (admin-only)
- `comfy.cancel` — best-effort per-prompt cancel (`{prompt_id}`); the safe
  user-facing cancel
- `comfy.upload` / `comfy.view` — stage a file into / fetch a file from ComfyUI's
  input dir
- `comfy.object_info` — full ComfyUI node catalog
- `comfy.system_stats` / `comfy.status` — health/capacity; `comfy.status` adds
  worker-level `{enabled, url, reachable}`
- `comfy.free` — unload models from VRAM without a cold restart
- `comfy.models.list` / `comfy.models.download` / `comfy.models.delete` — manage
  model files on the worker's persistent volume. `comfy.models.download` streams
  generic `progress` frames (NOT `comfy.event`) then a terminal `result`.

#### `comfy.event`

`comfy.execute` does **not** stream `progress` frames — ComfyUI's events don't
fit the `{progress, total, message}` shape. Instead it emits a dedicated frame:

```json
{
  "type": "comfy.event",
  "request_id": "<the execute request's id>",
  "data": { "event": "executing", "prompt_id": "p1", "node": "3" }
}
```

`data.event` is the discriminator, in emission order: `queued` → `queue`
(repeatable) → `started` / `cached` → `executing` (per node) → `progress` →
`node_output` → `preview` (only if `previews: true`) → `completed` or
`cancelled`. `result` is always the last frame.

## Result, error, chunk, and progress

### `result`

```json
{
  "type": "result",
  "request_id": "e1",
  "data": {
    "outputs": { "text": "hello" },
    "blobs": {}
  }
}
```

### `error`

```json
{
  "type": "error",
  "request_id": "e1",
  "data": {
    "error": "Unknown node type: foo.Bar",
    "traceback": "..."
  }
}
```

### `chunk`

Used by streaming providers and streaming provider-like operations.

### `progress`

The worker forwards `NodeProgress` messages from Python execution as protocol-level progress events:

```json
{
  "type": "progress",
  "request_id": "e1",
  "data": {
    "progress": 32,
    "total": 100,
    "message": "Downloading model"
  }
}
```

## Binary data

MessagePack allows binary payloads directly. NodeTool uses that for:

- input blobs in `execute.data.blobs`
- output blobs in `result.data.blobs`
- audio/image chunks for streaming provider APIs

## Diagnostics and failure handling

The bridge now surfaces worker problems in-band:

- `discover.load_errors` lists node import and metadata extraction failures
- `worker.status.load_errors` provides the same information on demand
- `error.traceback` is returned for failed requests
- recent `stderr` lines are still retained on the TS side for debugging startup failures

This matters because metadata may exist for a Python node even if its module failed to import in the worker. In that case the worker is connected, but the node is unavailable. `load_errors` is the authoritative signal for that situation.

## Limits and timeouts

- The worker and TS bridge enforce a maximum frame size via `NODETOOL_BRIDGE_MAX_FRAME_SIZE`
- The TS stdio bridge enforces a startup timeout (`startupTimeoutMs`, default 20s)
- Cancellation is cooperative

## Versioning

The JS runtime and Python worker each report a `BRIDGE_PROTOCOL_VERSION`. Two
distinct numbers govern compatibility (see `packages/protocol/src/bridge-protocol.ts`):

- **`BRIDGE_PROTOCOL_VERSION`** — the protocol the JS runtime currently speaks
  (presently `3`).
- **`MIN_BRIDGE_PROTOCOL_VERSION`** — the *hard floor* (presently `1`). The JS
  runtime rejects a worker only if it reports a protocol **below** this floor.

Compatibility rules:

- **Older worker, at or above the floor** — connects normally. It does **not**
  fail startup. Additive features the worker predates are gated per-capability:
  a v1 worker connects fine and simply doesn't expose the `models.*` family
  (gated by `supportsModelManagement()`, which requires v2+) or `comfy.*`
  (gated by `supportsComfy()`, which requires v3+ and `comfy.enabled`). Workers
  that predate the `protocol_version` field are treated as v1.
- **Worker below `MIN_BRIDGE_PROTOCOL_VERSION`** — rejected at `discover` with
  an actionable error (reinstall the Python environment). This is the only
  startup-failing case, reserved for genuine wire breaks.
- **Newer worker protocol than the JS runtime** — the runtime warns and assumes
  backward compatibility.

## Notes for contributors

If you change the protocol:

1. update the JS and Python protocol version constants together
2. document the schema change here
3. add or update end-to-end tests in `nodetool-core/tests/`
4. keep `discover` and `worker.status` authoritative for diagnostics

## Related

- [Architecture](architecture.md)
- [Developer Guide](developer/)
- `nodetool-core/README.md`
