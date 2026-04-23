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
7. Workflow execution uses `execute`, `cancel`, and `provider.*` messages

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

### `cancel`

Requests cooperative cancellation for an in-flight `execute` or streaming provider request.

### `provider.*`

Used for Python-only providers. Current message families include:

- `provider.list`
- `provider.models`
- `provider.generate`
- `provider.stream`
- `provider.text_to_image`
- `provider.image_to_image`
- `provider.tts`
- `provider.asr`
- `provider.embedding`

Streaming providers emit zero or more `chunk` messages followed by a terminal `result` or `error`.

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

The JS runtime and Python worker both speak `BRIDGE_PROTOCOL_VERSION`.

Compatibility rules:

- older worker protocol than the JS runtime requires: fail startup
- newer worker protocol: warn and assume backward compatibility

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
