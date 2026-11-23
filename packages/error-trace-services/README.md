# Error trace services

Server-side capture, retention and sync of redacted error traces. The
[error tracing guide](../../docs/error-tracing.md) covers what is recorded and
how redaction works. This package is the code that runs it.

- `captureError(error, { source, userId?, severity?, context? })` records a
  redacted row. It never throws, so an error handler can call it safely.
  `context` keeps only the keys in `ERROR_TRACE_CONTEXT_KEYS`.
- `isErrorTracingEnabled(env)` is false when `NODETOOL_ERROR_TRACES` is `0`,
  `false` or `off`.
- `startErrorTraceMaintenance(env)` prunes traces older than
  `NODETOOL_ERROR_TRACE_RETENTION_DAYS` (default 30) at startup and daily. It
  also starts sync when `NODETOOL_ERROR_TRACE_SYNC_URL` and
  `NODETOOL_ERROR_TRACE_SYNC_TOKEN` are both set. It returns a stop function.
- `errorTraceSyncConfig(env)` and `syncErrorTraces(config)` read that
  configuration and push unsynced traces in batches until none remain or a
  batch fails. Failed traces stay unsynced for the next run.

```ts
import {
  captureError,
  startErrorTraceMaintenance
} from "@nodetool-ai/error-trace-services";

const stop = startErrorTraceMaintenance();
captureError(new Error("provider failed"), {
  source: "job",
  context: { job_id: "..." }
});
stop();
```
