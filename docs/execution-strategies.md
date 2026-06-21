---
layout: page
title: "Execution Strategies"
description: "How NodeTool runs workflows — the actor-model kernel — and how code-runner nodes sandbox untrusted code in Docker or subprocesses."
---

This page covers two distinct mechanisms that are easy to conflate:

1. **Workflow execution** — how the kernel runs a graph of nodes. This is an
   in-process actor model with message-passing; there are no per-job
   threads, subprocesses, or containers.
2. **Code execution** — how individual *code-runner nodes* (Python, JavaScript,
   Bash, …) run arbitrary user code. This is the only place Docker /
   subprocess sandboxing applies, and it sandboxes the *code inside one node*,
   not the workflow.

See also [Architecture](architecture.md) for the system overview and
[Automatic Message Correlation](correlation-design.md) for the lineage model
the scheduler relies on.

## Workflow Execution: the actor model

A workflow is a DAG. The runtime lives in `packages/kernel/`:

- **`WorkflowRunner`** (`packages/kernel/src/runner.ts`) orchestrates one job.
- **`NodeActor`** (`packages/kernel/src/actor.ts`) runs a single node.
- **`NodeInbox`** (`packages/kernel/src/inbox.ts`) buffers each node's inputs
  per handle and tracks how many upstream sources remain open.

There is no `JobExecutionManager` and no pluggable "threaded / subprocess /
docker" strategy for running a workflow. The whole graph runs concurrently in
one event loop via async actors that pass messages to each other's inboxes.

### What WorkflowRunner does

`WorkflowRunner.run(request, graphData)` performs, in order:

1. **Bypass rewrite** — `rewriteBypassedNodes` re-routes around nodes flagged
   `ui_properties.bypassed`.
2. **Invalid-edge filtering** — drops edges whose source or target node is
   missing.
3. **Correlation analysis** — `analyzeCorrelation` (mandatory) computes the
   static lineage scope of every node input/output. Issues abort the run with a
   `GraphValidationError` before any actor starts.
4. **Graph + node validation** — structural validation plus an optional
   per-node `validateNode` callback (e.g. missing required fields).
5. **Inbox initialization** — one `NodeInbox` per node, seeded with the count of
   incoming data edges per handle (and one `__control__` upstream per unique
   controller).
6. **Node initialization** — resolves and caches one executor instance per node.
7. **Input dispatch** — `_dispatchInputs` runs each external input node's
   `process()` once and delivers values to downstream inboxes. Non-streaming
   inputs then signal end-of-stream (EOS); streaming-output inputs (e.g.
   `RealtimeAudioInput`) stay open for later `pushInputValue()` calls.
8. **Actor spawning** — `_processGraph` creates a `NodeActor` per node and runs
   them all with `Promise.all`. Actors block on their inboxes until upstream
   data arrives, so nodes whose inputs are ready run concurrently while the
   rest wait.

The runner also routes outputs downstream (`_sendMessages`), tracks per-edge
message counters for the UI (throttled `edge_update` events), propagates EOS
(`_sendEOS`), and emits `job_update` / `output_update` messages through the
`ProcessingContext`.

### Job outcomes

`run()` returns a `RunResult` with status `completed`, `failed`, `cancelled`, or
`suspended`. Precedence at finalization is **cancel > suspend > failed >
completed**: a node throwing `WorkflowSuspendedError` yields a `suspend`
payload (human-in-the-loop pause), a node error fails the whole job, and
`cancel()` aborts the run-level `AbortController` and closes every inbox to
unblock waiting actors.

### The four actor modes

`NodeActor._runImpl` picks a mode from the node's hydrated behavior flags. (The
runner requires a *hydrated* graph: the flags below must be set, or streaming
nodes would silently run as one-shot `process()` calls.)

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Buffered** | default | Gathers inputs via the correlated scheduler and calls `process()` once per ready input set. |
| **Streaming input** | `is_streaming_input` | Node drains its inbox itself via `NodeInputs` (`run(inputs, outputs, ctx)`), emitting through `NodeOutputs`. |
| **Streaming output** | `is_streaming_output` | Calls `genProcess()`, which yields partial frames; each yield is routed downstream as it is produced. |
| **Controlled** | `is_controlled` | Waits for control events on the `__control__` handle, caches data inputs, and re-runs `process()` per `run` event until controllers signal EOS. |

Buffered and streaming-output nodes share the same correlation-aware gather
path (`_runCorrelated`); the difference is whether the executor exposes
`process()` or `genProcess()`.

### Correlation-aware scheduling (`_runCorrelated`)

Buffered/streaming-output nodes do **not** simply wait for "all inputs." They
schedule per *correlation key* so that fan-out/fan-in over iterations stays
correctly paired. `_runCorrelated` (in `actor.ts`) classifies each connected
data handle by its static scope:

- **max-scope** — scope length equals the node's invocation scope; bucketed per
  projected lineage key. One handle may be the *repeating driver*
  (`repeats_per_key`), firing once per arriving envelope.
- **strict-prefix sticky** — a shorter non-empty scope; the latest value is kept
  per projected parent key (side inputs that change less often).
- **empty** — empty scope; a single sticky value (or the node's declared
  property default).

As envelopes arrive on `iterAnyWithEnvelope()`, the actor records each into its
bucket and re-evaluates which keys are now *ready*. A key is ready when every
handle has a value for it (lists wait for the handle to close so the full set is
captured). Each ready key fires `process()`/`genProcess()` with its matched
inputs, and the produced outputs inherit (or mint) the correct lineage so
downstream joins line up. Source nodes (no connected data handles) fire once
with empty inputs.

Inbox safety limits (`max_pending_keys`, `max_pending_messages_per_key`) abort
the run if pending keys grow without bound — typically a missing upstream close.
See [correlation-design.md](correlation-design.md) for the full model: lineage
as root-id → item-token maps, static scope analysis, and done / dropped-key /
scope-close propagation.

### Sync modes (legacy framing)

The older `zip_all` / `on_any` / `sticky` sync-mode vocabulary maps onto the
correlation scheduler: `zip_all`-style "wait for all handles" is the max-scope
readiness rule, `sticky` is the strict-prefix / empty-scope handle classes, and
`on_any` is the per-arrival driver behavior. New nodes declare correlation via
input scope and `output_correlation` rather than a single `sync_mode` flag.

### Control events

Controller nodes (e.g. agent nodes) drive **controlled** nodes over control
edges. The runner builds a `_control_context` describing each controlled node's
properties and "run" action schema, injects it as an input, and exposes
`sendControlEvent(targetNodeId, properties)` (via
`ProcessingContext.setSendControlEvent`) so a controller can dispatch a run and
await that node's next output. Responses are tracked FIFO per node so a burst of
concurrent control calls doesn't drop a waiter.

## Code Execution: sandboxed runners

Separately from workflow scheduling, **code-runner nodes** execute arbitrary
user code in a sandbox. These live in `packages/code-runners/` and are consumed
by the nodes in `packages/code-nodes/` (Python, JavaScript, Bash, Ruby, Lua,
shell command). This is the only place "docker / subprocess" legitimately
applies, and it isolates the *code in one node*, not the workflow.

### StreamRunnerBase

`StreamRunnerBase` (`packages/code-runners/src/stream-runner-base.ts`) is the
base class. Its `stream(userCode, envLocals, options)` async generator yields
`[slot, value]` tuples where `slot` is `"stdout"` or `"stderr"`. It supports two
mutually exclusive `mode`s:

- **`"docker"`** (default) — run inside a Docker container (via `dockerode`).
- **`"subprocess"`** — run as a local child process on the host.

`stop()` cooperatively aborts: it force-removes the active container or
terminates the child (SIGTERM, escalating to SIGKILL after a grace period).

#### Docker sandbox defaults

The constructor applies security-first defaults for untrusted code:

| Option | Default | Notes |
|--------|---------|-------|
| `image` | `"bash:5.2"` | Subclasses override (e.g. `python:3.11-slim`, `node:22-alpine`). |
| `timeoutSeconds` | `10` | Max container/process lifetime. |
| `memLimit` | `"256m"` | Container memory cap. |
| `nanoCpus` | `1_000_000_000` | CPU quota (1e9 = 1 CPU). |
| `networkDisabled` | `true` | No network for code runners. |
| `ipcMode` | `"private"` | Never shares host/other-container IPC or shared memory. |
| `capDrop` | `["ALL"]` | All Linux capabilities dropped. |
| `securityOpt` | `["no-new-privileges"]` | Blocks setuid privilege escalation. |
| `user` | `"1000:1000"` | Never runs as root; `null` keeps the image's user. |
| `readonlyRootfs` | `false` | Opt-in read-only root FS (with a writable `/tmp` tmpfs). |
| `workspaceMountPath` / `dockerWorkdir` | `"/workspace"` | Bind-mounted workspace; `readonlyWorkspace` opt-in. |

These are *node/runner* options, not environment variables.

### Runner subclasses

Exported from `packages/code-runners/src/index.ts`:

- **`PythonDockerRunner`** — wraps env vars as `key = repr(value)` lines, runs `python -c`.
- **`JavaScriptDockerRunner`**, **`BashDockerRunner`**, **`RubyDockerRunner`** — per-language code runners.
- **`LuaRunner` / `LuaSubprocessRunner`** — Lua execution.
- **`CommandDockerRunner`** — shell-command execution.
- **`ServerDockerRunner`** — starts a long-running server in a container,
  publishes an ephemeral host port, and yields an `["endpoint", url]` message
  once the port is TCP-reachable (networking enabled).
- **`ServerSubprocessRunner`** — same endpoint pattern as a local subprocess;
  can download and cache a remote binary on disk.

The `code-nodes` (e.g. the Python/JavaScript code nodes in
`packages/code-nodes/src/nodes/code.ts`) expose `image` and `execution_mode`
(`"docker"` | `"subprocess"`) as node properties and construct the matching
runner, then collect its streamed output.

## Cancellation and shutdown

- **Workflow**: `WorkflowRunner.cancel()` aborts the run-level `AbortController`
  (observed by node code via `inputs.signal`) and closes every inbox so waiting
  actors unblock; the job finalizes as `cancelled`.
- **Code runner**: `StreamRunnerBase.stop()` force-removes the container or
  terminates the subprocess (SIGTERM → SIGKILL escalation).

## Related

- [Architecture](architecture.md) — system components, message types, job lifecycle.
- [Automatic Message Correlation](correlation-design.md) — lineage, scopes, and the scheduler design.
- `packages/kernel/` — `runner.ts`, `actor.ts`, `inbox.ts`, `correlation-analysis.ts`.
- `packages/code-runners/` — sandboxed code execution runners.
