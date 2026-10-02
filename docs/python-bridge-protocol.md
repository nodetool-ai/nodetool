---
layout: page
title: "Python Bridge Protocol"
description: "How NodeTool talks to the Python worker over stdio using length-prefixed MessagePack frames."
---

NodeTool runs Python nodes and local-compute providers in a separate Python worker process. The TypeScript runtime talks to it over a **stdio RPC protocol** (a locally spawned worker) or the same frames over a **WebSocket** (a worker that is already running, such as a Docker container).

## Why this protocol exists

NodeTool uses Python for:

- Python node execution
- local ML providers such as MLX and HuggingFace
- ComfyUI and Blender jobs on workers that front them
- media processing and model-specific dependencies

The TypeScript runtime uses stdio instead of a localhost socket for the worker because it is simpler to supervise, avoids port-management issues, and keeps the worker strictly parent-scoped.

## Transport

`createPythonBridge()` (`packages/runtime/src/python-bridge-factory.ts`) picks the transport. If `NODETOOL_WORKER_URL` is set to a `ws://` or `wss://` address, the runtime uses the WebSocket transport. Otherwise it uses stdio.

### Stdio

- Parent process spawns: `python -m nodetool.worker --stdio`
- `stdin` / `stdout`: binary protocol traffic
- `stderr`: worker logs and startup diagnostics

The interpreter is the first match of: the `pythonPath` option or `NODETOOL_PYTHON`, the active `CONDA_PREFIX` when it looks like a NodeTool environment (named `nodetool` or `conda_env`), then the NodeTool-managed conda environments for the platform.

In production (`NODETOOL_ENV=production`) the stdio bridge refuses to start unless `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1`. The WebSocket bridge is allowed in production.

### WebSocket

- The bridge never spawns a process. The worker lifecycle is owned elsewhere.
- One WebSocket binary message is exactly one MessagePack frame, with no length prefix.
- `NODETOOL_WORKER_TOKEN` (or the `workerToken` option) is sent as `Authorization: Bearer <token>` on connect and on every reconnect.
- If the socket drops, in-flight requests are rejected and the bridge reconnects with exponential backoff (1s, doubling, capped at 30s). After a reconnect it repeats `discover` and `worker.status`.

### Stdio framing

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
3. Python prints `NODETOOL_STDIO_READY` on `stderr` (stdio only)
4. TypeScript sends `discover`
5. Python responds with node metadata, protocol version, and any load errors
6. TypeScript requests `worker.status`, which sets the capability gates described under [Versioning](#versioning)
7. Workflow execution uses `execute` / `execute.stream`, `cancel`, `provider.*`, and, when the worker supports them, `models.*`, `job.*`, `comfy.*`, and `blender.*` messages

## Message types

### `discover`

Returns the worker's executable node inventory.

Response data:

- `protocol_version`
- `nodes` — each entry may carry `requires_vram_gb` (v4+): the approximate VRAM
  that node type's weights need, in GiB. The JS side echoes it back on
  `execute` so the worker's reclaim pass has a real number to target instead of
  a percentage threshold.
- `load_errors`

Example:

```json
{
  "type": "discover",
  "request_id": "d1",
  "data": {
    "protocol_version": 6,
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
- `model_prepare_backends` (v5+): the backends `models.prepare` accepts
- `comfy` (v3+): present when the worker fronts a ComfyUI server
- `blender`: present when the worker can run Blender

### `execute`

Executes a Python node.

Request data:

- `node_type`
- `fields`
- `secrets`
- `blobs`
- `blob_transfer: "chunked-v1"`, sent only to workers that report v5 or newer (see [Chunked blob transfer](#chunked-blob-transfer))

Run identity, added in **v4**. Every field is optional, and a field the JS host
cannot name is omitted rather than sent as null:

- `node_id` — the graph node id. Becomes the constructed node's `_id`. Before
  v4 the worker built every node with no id, so `self._id` was `""` for all of
  them: a node calling `set_model(self._id, …)` registered into a single shared
  bucket, and `release_nodes()` had nothing meaningful to release. `node_id` is
  what makes the worker's node → model map real.
- `job_id` — pairs the execution with the `job.start` / `job.end` boundary.
- `workflow_id`, `user_id` — populate the worker's `WorkerContext`, which
  previously had neither.
- `requires_vram_gb` — the hint the worker itself reported for this node type at
  `discover`.

These are extra dict entries, so the JS side sends them **unconditionally**
rather than behind the v4 capability gate: a pre-v4 worker reads the four keys
it knows and ignores the rest, and gating would only starve a worker that does
understand them whenever its `worker.status` has not landed yet.

Possible response types:

- `progress`
- `result`
- `error`

### `execute.stream`

Executes a Python node that streams results. Same request data as `execute`
(including the v4 identity fields), but the worker emits zero or more `chunk`
messages (each carrying partial `outputs`/`blobs`) followed by a terminal
`result` or `error`.

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
- `provider.text_to_video`
- `provider.image_to_video`
- `provider.reference_to_video`
- `provider.text_to_audio`
- `provider.tts`
- `provider.tts_encoded`
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
- `models.prepare` (**v5**, gated by `supportsModelPreparation(backend)`) — prepare an image-owned model through a backend the worker lists in `worker.status.model_prepare_backends`. Request data: `backend`, `model_type`, `repo_id`, and an optional Hugging Face `token`. It streams `progress` frames like `models.download`.
- `models.evict` (**v4**, gated by `supportsJobLifecycle()`) — drop loaded model
  weights. Optional request data narrows the scope: `node_ids`, `job_id`,
  `target_vram_gb` (stop once that many GiB are reclaimed). Response data is
  `{evicted: string[], freed_vram_gb?: number}`. This is the path for what only
  the JS side knows — the user switched workflows, another process wants the
  GPU, the worker is idle. Without it the worker only ever reclaims reactively,
  on its own thresholds. Calling it against a pre-v4 worker resolves to
  `{evicted: []}` instead of erroring, so a host asking to free memory never has
  to branch on the worker's version.

### `job.*`

The run boundary. Introduced in bridge protocol **v4** and gated by
`supportsJobLifecycle()`.

- `job.start` — opens a run. Request data: `job_id`, plus optional
  `workflow_id` / `user_id`. Optional in the sense that the worker needs no
  `job.start` to attribute an execution (every `execute` carries its own
  `job_id`); it exists as the one place to do a single reclaim pass per run
  instead of one per node.
- `job.end` — closes a run. Same data plus `reason`
  (`completed` | `failed` | `cancelled` | `abandoned`). The job's nodes are
  retired and their models become eligible for release. This is the caller
  `release_nodes()` never had: without it the worker's model cache grows across
  runs and is only ever trimmed reactively under memory pressure.

`job.end` must fire on abnormal termination too — cancelled, client
disconnected, run abandoned — or the leak simply moves to the failure path.
On the JS side `ExecutionSession` sends it from the same `finally` that closes
the bridge, so completion, failure, cancellation and timeout all reach it. Both
calls are fire-and-forget and swallow their own failures: a boundary is
bookkeeping, and a `job.end` that fails against a worker already tearing down
must not turn a finished run into a failed one.

A host that owns a long-lived shared bridge (the WebSocket runner) and injects
its own executor resolver must pass that bridge to the session as
`jobLifecycleBridge` — that host's `bridgeFactory` deliberately returns null, so
without it nothing closes the boundary for the exact deployment the shared
bridge exists for.

### `comfy.*`

ComfyUI proxy. Introduced in bridge protocol **v3**, gated by `supportsComfy()`
— a worker offers these only when it fronts a co-located, loopback-only ComfyUI
server AND reports `worker.status.comfy.enabled: true`. Route `comfy.*` requests
only to such workers. The full field-level reference lives in
`docs/comfy-proxy.md` in nodetool-core; [ComfyUI](comfyui.md) covers the nodes
that sit on top of these messages.

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

### `blender.*`

Blender jobs. Gated by `supportsBlender()`: a worker offers `blender.execute` only when `worker.status.blender.enabled` is `true`. There is no protocol-version floor for this family, so the flag alone decides.

- `blender.execute` — request data is `{job, inputs}` plus optional `blobs` and `timeout`. It streams `blender.event` frames, then a terminal `result` or `error`. Cancel with the `cancel` frame.

`blender.event` carries `data.event` (today only `progress`) with `frame` and `total`, taken from Blender's `Fra:<n>` output during animation renders.

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

### Chunked blob transfer

From protocol v5 the JS side sets `blob_transfer: "chunked-v1"` on `execute` and on provider calls that return media. A worker that honors it sends each result blob as three frame types instead of inline bytes:

- `blob.start` — `{name, size}`
- `blob.chunk` — `{name, offset, bytes}`
- `blob.end` — `{name, size, sha256}`

The bridge reassembles the blob and checks it against the final size and SHA-256. A mismatch rejects the request and sends `cancel`. A blob that declares a size above `NODETOOL_PYTHON_MAX_RESULT_BLOB_BYTES` (default 2 GiB) is rejected, as is an out-of-order or oversized chunk. Older workers keep returning the inline `blobs` map.

## Diagnostics and failure handling

The bridge now surfaces worker problems in-band:

- `discover.load_errors` lists node import and metadata extraction failures
- `worker.status.load_errors` provides the same information on demand
- `error.traceback` is returned for failed requests
- recent `stderr` lines are still retained on the TS side for debugging startup failures

This matters because metadata may exist for a Python node even if its module failed to import in the worker. In that case the worker is connected, but the node is unavailable. `load_errors` is the authoritative signal for that situation.

## Limits and timeouts

- The worker and TS bridge enforce a maximum frame size via `NODETOOL_BRIDGE_MAX_FRAME_SIZE` (default 256 MiB)
- Both transports enforce a startup timeout (`startupTimeoutMs`, default 20s)
- `execute` times out after `NODETOOL_PYTHON_EXECUTE_TIMEOUT_MS` (default 12 minutes)
- `worker.status` times out after `NODETOOL_PYTHON_STATUS_TIMEOUT_MS` (default 30s)
- Model downloads fail after `NODETOOL_PYTHON_DOWNLOAD_IDLE_TIMEOUT_MS` (default 5 minutes) without a progress frame
- Cancellation is cooperative
- `NODETOOL_VALIDATE_BRIDGE_FRAMES=1` validates every inbound frame against the Zod schemas in `packages/protocol/src/bridge-frames.ts`. It defaults to on under tests and off otherwise.

## Versioning

The JS runtime and Python worker each report a `BRIDGE_PROTOCOL_VERSION`. Two
distinct numbers govern compatibility (see `packages/protocol/src/bridge-protocol.ts`):

- **`BRIDGE_PROTOCOL_VERSION`** — the protocol the JS runtime currently speaks
  (presently `6`).
- **`MIN_BRIDGE_PROTOCOL_VERSION`** — the *hard floor* (presently `1`). The JS
  runtime rejects a worker only if it reports a protocol **below** this floor.

Compatibility rules:

- **Older worker, at or above the floor** — connects normally. It does **not**
  fail startup. Additive features the worker predates are gated per-capability:
  a v1 worker connects fine and simply doesn't expose the `models.*` family
  (gated by `supportsModelManagement()`, which requires v2+), `comfy.*` (gated
  by `supportsComfy()`, which requires v3+ and `comfy.enabled`), `job.*` /
  `models.evict` (gated by `supportsJobLifecycle()`, which requires v4+),
  `models.prepare` (gated by `supportsModelPreparation()`, which requires v5+
  and a matching `model_prepare_backends` entry), or `blender.*` (gated by
  `supportsBlender()`, which requires `blender.enabled`).
  Workers that predate the `protocol_version` field are treated as v1.

  The v4 identity fields on `execute` are the exception that proves the rule:
  they are extra keys on an existing message, not a new message, so they are
  sent to every worker and ignored by the ones that predate them. Only new
  message *types* need a capability gate, because those are what a worker
  answers with `Unknown message type`.
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
