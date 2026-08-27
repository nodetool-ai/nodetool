---
layout: page
title: "Execution Strategies"
description: "How NodeTool runs workflows — the actor-model kernel — and how the Code node sandboxes untrusted code in a WebAssembly guest."
---

This page covers two distinct mechanisms that are easy to conflate:

1. **Workflow execution** — how the kernel runs a graph of nodes. This is an
   in-process actor model with message-passing; there are no per-job
   threads, subprocesses, or containers.
2. **Code execution** — how the *Code node* runs arbitrary user JavaScript in a
   QuickJS WebAssembly guest. That sandbox covers the *code inside one node*,
   not the workflow.

See also [Architecture](architecture.md) for the system overview and
[Automatic Message Correlation](https://github.com/nodetool-ai/nodetool/blob/main/docs/correlation-design.md) for the lineage model
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

`run()` returns a `RunResult` with status `completed`, `failed`, or `cancelled`.
Precedence at finalization is **cancel > failed > completed**: a node error
fails the whole job, and `cancel()` aborts the run-level `AbortController` and
closes every inbox to unblock waiting actors.

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
See [correlation-design.md](https://github.com/nodetool-ai/nodetool/blob/main/docs/correlation-design.md) for the full model: lineage
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

## Code Execution: the sandboxed Code node

Separately from workflow scheduling, the **Code node**
(`nodetool.code.Code`, `packages/code-nodes/src/nodes/code-node.ts`) executes
user JavaScript in a QuickJS WebAssembly guest — see
`@nodetool-ai/agents/js-sandbox`. It isolates the *code in one node*, not the
workflow, and runs the same way in the browser and on the server: no Docker, no
subprocess, no host interpreter.

The guest gets standard JavaScript plus a fixed set of bridges — `fetch()`,
workspace file access, `getSecret()`, `sleep()`, `progress()`,
`crypto`, `format`, and CSV/HTML `data` helpers. Dynamic inputs arrive on the
`inputs` object; the keys of the returned object become the node's outputs.


## Cancellation and shutdown

- **Workflow**: `WorkflowRunner.cancel()` aborts the run-level `AbortController`
  (observed by node code via `inputs.signal`) and closes every inbox so waiting
  actors unblock; the job finalizes as `cancelled`.
- **Code node**: the QuickJS guest is torn down with its host call; the run's
  abort signal ends any in-flight bridge call.

## Related

- [Architecture](architecture.md) — system components, message types, job lifecycle.
- [Automatic Message Correlation](https://github.com/nodetool-ai/nodetool/blob/main/docs/correlation-design.md) — lineage, scopes, and the scheduler design.
- `packages/kernel/` — `runner.ts`, `actor.ts`, `inbox.ts`, `correlation-analysis.ts`.
- `packages/code-nodes/` — the sandboxed Code node.
