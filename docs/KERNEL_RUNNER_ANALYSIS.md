# Kernel & WorkflowRunner review — bugs, issues, design flaws

Review of `packages/kernel/` (runner, actor, inbox, graph, io, correlation
analysis, triggers, durable inbox) as of 2026-07-04. Findings are ordered by
severity within each section. Line references are against the source at the
time of review (commit 21230c7).

**Fix status (this PR):** findings #1, #2, #3, #4, #6, #9, #13, #16, #17 are
fixed; #7, #11, #12 now emit warnings instead of failing silently (see the
follow-up commits on this branch). Still open, pending a design decision:
#5 (control-response attribution needs an event id echoed through the
actor), #8 (`RunResult.outputs` accumulation semantics), #10 (backpressure
defaults), #14, #15, and the smaller issues.

## Bugs

### 1. Edge status regresses from `completed` back to `active` at run end

`_incrementEdgeCounter` throttles `edge_update` emissions and marks throttled
edges dirty (`runner.ts:1623-1625`). `_sendEOS` emits the terminal
`status: "completed"` update (`runner.ts:1473-1479`) but never clears the
edge from `_edgeCounterDirty`. At run end, `_drainActiveEdges` calls
`_flushEdgeCounters` (`runner.ts:1643-1654`), which re-emits
`status: "active"` for every dirty edge — including edges already reported
completed. Any edge that received a message within the last
`EDGE_UPDATE_MIN_INTERVAL_MS` before its source finished ends the run with
`completed` followed by `active` as its final message. Fix: clear the edge
from `_edgeCounterDirty` (and stamp `_edgeCounterLastEmitMs`) inside
`_sendEOS`, or have `_flushEdgeCounters` skip edges whose EOS was already
emitted (`_eosSentEdges` is available).

### 2. Behavior-flag hydration is OR-based, so stale saved `true` flags can never be corrected

`Graph.loadFromDict` computes
`is_streaming_input: descriptorDefaults.is_streaming_input || node.is_streaming_input || false`
(`graph.ts:437-457`), same for `is_streaming_output`, `is_controlled`,
`is_join_node`. The comments claim the registry is the source of truth and
saved JSON is "a cache that gets overwritten", and `input_mode` /
`output_correlation` really are overwritten — but the boolean flags are ORed.
If a node type migrates from streaming to buffered (or stops being a join
node), every saved workflow keeps the stale `true` and runs the wrong
execution mode, with no way to fix it short of re-saving the graph. The
actor trusts these flags to pick `run()` vs `process()` vs `_runControlled`,
so this silently changes execution semantics. Fix: treat the registry value
as authoritative when the resolver returned a descriptor
(`descriptorDefaults.is_streaming_input ?? node.is_streaming_input ?? false`
is still wrong; it should be
`descriptorDefaults.is_streaming_input ?? false` when the registry resolved,
falling back to the saved value only for unresolved/dynamic types).

### 3. `pushInputValue` bypasses the input node's `process()`

`_dispatchInputs` runs the input node's executor so transforming inputs
(StringInput `max_length`, DocumentFileInput building a `DocumentRef`,
MessageDeconstructor splitting) emit their declared per-handle outputs
(`runner.ts:938-951`). `pushInputValue` (`runner.ts:337-367`) puts the raw
value straight onto outgoing edges. The same input node behaves differently
depending on whether the value arrived as a start param or was streamed in —
streamed values skip validation/transformation entirely and leak the raw
value to every edge regardless of `sourceHandle` semantics. It also stamps a
different `source_edge_id` (`external:...` vs the real edge id), which will
not match the per-edge lineage-done/closed bookkeeping keyed by real edge
ids.

### 4. Controlled-node wait can deadlock the whole run

`_runControlled` refuses to process any control event until *every* data
handle has produced at least one value (`actor.ts:1301-1303`,
`_waitForDataInputs` at `actor.ts:1341-1377`). The wait loop only exits when
all handles are satisfied or the inbox is fully drained — and "fully
drained" includes `__control__`, which stays open while the controller is
alive. Two realistic shapes hang forever:

- An upstream node completes without emitting on the controlled node's data
  handle (filter/conditional output). The handle closes but `pending` never
  empties, control events are held aside indefinitely, and a controller
  awaiting `sendControlEvent` never resolves → `_processGraph`'s
  `Promise.all` never settles. No timeout exists anywhere on this path.
- An agent both controls the node and (directly or transitively) produces
  its data input: the agent awaits the control response before emitting
  data; the controlled node awaits data before answering.

The runner already rejects pending control responses when the *controlled*
actor finishes, but here the controlled actor never finishes. At minimum the
wait should give up when all data handles are closed (drop `pending` handles
whose upstream count reached zero), mirroring how `_runCorrelatedImpl`
treats closed empty-scope handles as "use defaults".

### 5. `sendControlEvent` responses are matched to the wrong output when event sources mix

`_sendMessages` resolves the oldest pending `sendControlEvent` waiter on
*any* output emission from the target node (`runner.ts:1357-1364`). The FIFO
assumption holds only when `sendControlEvent` is the sole source of control
events. If the same node is also driven by a control *edge*
(`__control_output__` routing) or by `dispatchControlEvent`, an edge-driven
firing's outputs resolve a `sendControlEvent` waiter that belongs to a
different event. The agent then receives another invocation's result. The
response should be correlated to the event (e.g. stamp an event id on the
ControlEvent and echo it through the actor), not inferred from global output
order.

### 6. `_dispatchInputs` falls back to leaking the raw value on missing handles

`handleValue = nodeOutputs[edge.sourceHandle] !== undefined ? ... : value`
(`runner.ts:958-961`). The fallback exists for test doubles returning `{}`,
but it applies per-edge: a real input node with several declared outputs
that legitimately omits one (e.g. "no attachments") gets the raw input value
delivered on that edge instead of nothing. Downstream receives a value of
the wrong type/shape. The fallback should trigger only when `process()`
returned an entirely empty record, not per-handle.

### 7. Streaming-input node without `run()` silently ignores all its inputs

The legacy fallback (`actor.ts:388-399`) calls `process()` once with only
the node's own properties. Data queued on its inbox is never read; it is
reported only as a post-run "pending inbox work" warning. A misdeclared node
(registry says `is_streaming_input`, implementation has no `run`) drops all
upstream data while the run still reports `completed`. This should be a node
error, not a silent fallback.

### 8. `RunResult.outputs` keeps only the last firing of multi-fire terminal nodes

Output collection stores `result.outputs`, which is the actor's
`_latestResult` — the last invocation's record (`runner.ts:1099-1110`,
`actor.ts:473`). A terminal node fired once per streamed item contributes
only its final values to `RunResult.outputs`; earlier firings survive only
as `output_update` messages. The `Record<string, unknown[]>` shape suggests
accumulation was intended. Also, `Object.values(result.outputs)` flattens
multiple output handles into one array, losing handle names, and
`_isOutputNode` is "no outgoing data edges" (`runner.ts:1717-1721`), so a
controller agent with only a control edge out also lands in workflow
outputs, and two terminal nodes sharing a `name` merge into one bucket.

### 9. `TriggerWakeupService` defeats `DurableInbox`'s append serialization

`DurableInbox.append` chains appends per *instance* because
getMaxSeq→save is a read-modify-write (`durable-inbox.ts:196-222`). But
`deliverTriggerInput` constructs a fresh `DurableInbox` per call over the
shared store (`trigger-wakeup.ts:88-89`), so concurrent deliveries for the
same (run, node) each get their own no-op chain, read the same `maxSeq`, and
persist duplicate `seq` values — corrupting the ordering that `findPending`
sorts by. The service should cache one `DurableInbox` per (runId, nodeId).

## Design flaws / risks

### 10. No backpressure in production, and the correlated scheduler can't be backpressured at all

No production caller passes `bufferLimit`, so every inbox is unbounded
(`runner.ts:771`). Independently, `_runCorrelatedImpl` eagerly drains the
inbox into actor-local buckets (`maxBuckets`, sticky maps), so even with a
`bufferLimit`, buffered nodes release inbox backpressure immediately and
buffering just moves into the actor. The only guards are
`maxPendingKeys`/`maxPendingMessagesPerKey` (10k × 10k envelopes). A fast
producer feeding a slow consumer grows the heap without bound; audio-rate
streams make this practical, not theoretical.

### 11. Unmigrated streaming producers silently collapse to last-value-wins downstream

The analyzer defaults missing `output_correlation` to `single` with
`repeats: false` (`correlation-analysis.ts:480`). A custom/legacy node that
emits many values on one slot (without declaring `chunk`/`iteration`) feeds
a downstream buffered handle classified `empty`-scope sticky
(`actor.ts:568-579`), where each arrival overwrites the previous
(`actor.ts:813-816`) and the node fires once at close with only the last
value. Pre-correlation semantics fired per message. Correctness of every
third-party node now hinges on correlation metadata being declared; the
failure mode is silent data loss. There is no warning when multiple
envelopes overwrite an empty-scope sticky slot — emitting one would make the
migration gap visible.

### 12. Non-driver duplicate keys are silently dropped inside the actor

In `_runCorrelatedImpl` with no repeating driver, a key fires once
(`fired` set, `actor.ts:727-738`); a second envelope arriving for the same
key on a max-scope handle stays in the actor-local bucket forever. Unlike
inbox-stranded data, `_checkPendingInboxWork` cannot see it (the envelope
was already popped), so the loss is completely silent.

### 13. `Graph` mutates caller-owned node descriptors

`_detectControlledNodes` writes `is_controlled = true` onto the node objects
passed in (`graph.ts:515-525`), and the runner passes the caller's
`graphData.nodes` through (bypass rewrite preserves object identity). A
`WorkflowRunner.run()` therefore mutates the caller's graph data despite the
`readonly` typing. Harmless today, but it leaks state across runs and
violates the descriptor contract.

### 14. Control context exposes every property value to the LLM

`_buildControlContext` embeds all non-underscore property values of
controlled nodes as tool-schema defaults (`runner.ts:1810-1900`). If a
controlled node carries a sensitive string property (token, endpoint,
prompt containing PII), it is shipped into the controller LLM's tool
definitions. Similarly, `generation_complete` rides all scalar resolved
inputs into persisted asset metadata (`actor.ts:149-164`). Both need a
notion of secret/sensitive properties to redact.

### 15. Trigger watchdog restarts forever with no backoff

`_watchdogCheck` restarts `failed`/`completed` jobs every tick
(`trigger-manager.ts:337-374`). A workflow that fails at startup restarts
every 30 s indefinitely — no backoff, no retry cap, no circuit breaker.
`getInstance` also silently ignores differing `opts` on subsequent calls,
and only the latest watchdog check is awaited by `shutdown`
(`_watchdogCheckInFlight` is overwritten per tick), so an older,
still-running check can theoretically revive a job after shutdown's await.

### 16. Two job ids per run

`edge_update` messages use `this.jobId` from the constructor while
`job_update` uses `request.job_id` (`runner.ts:1629-1635` vs 473-478).
Callers that pass different values get edge updates that clients cannot
associate with the job. One of the two should win (or the constructor id
should be dropped).

### 17. Runner instance lifecycle races

`_resetRunState()` runs at the top of `_runImpl`, so `cancel()` called
between construction and `run()` is silently lost (`_cancelled` reset,
fresh `AbortController`). A second `run()` on the same instance while the
first is in flight clobbers all shared state. Cheap fix: latch a
"cancelled before start" flag and reject concurrent `run()`.

## Smaller issues

- **Inbox arrival queue is O(n²)** — `_arrival` is a plain array;
  `_removeFromArrival` does `indexOf`+`splice` per consumed envelope and
  `prepend` does `unshift` (`inbox.ts:113`, `579-585`). With deep backlogs
  (audio-rate streams, list aggregation) this degrades quadratically. A
  per-handle counter or linked list removes the scans.
- **`_notifyWaiters` / `_notifyPutWaiters` wake every waiter** while their
  doc comments say "wake one" (`inbox.ts:552-566`) — thundering herd on hot
  streams; each `put` wakes all consumers and all blocked producers.
- **`put()` on a closed inbox silently drops data** and returns normally
  (`inbox.ts:202`); fine for cancellation, but producers cannot distinguish
  delivered from dropped.
- **`_emitNodeStatus("running")` fires at actor start**, before any input
  arrives (`actor.ts:303`), so every node in the graph shows "running"
  immediately; there is no "waiting for inputs" state.
- **`getInputSchema`/`getOutputSchema` classify nodes by
  `type.includes("Input")`** (`graph.ts:772-783`) while the runner uses
  `type.startsWith("nodetool.input.")` — the two predicates disagree for
  types like `...InputSanitizer`, and every schema property is marked
  `required` even when a default exists.
- **A node that is both `is_streaming_input` and `is_controlled`** takes the
  streaming branch and its control events are never consumed
  (`actor.ts:310-401` branch order); combinations of behavior flags are not
  validated.
- **`_runControlled` ignores `_listInputHandles` and lineage** — multi-edge
  list inputs to controlled nodes keep only the latest value
  (`actor.ts:1384-1395`).
- **Duplicate `__control_output__` routing is possible by edge shape**: the
  runner routes `__control_output__` to all control edges, then the edge
  loop routes `outputs[edge.sourceHandle]` again (`runner.ts:1154-1227`).
  Convention (`sourceHandle: "__control__"`) prevents overlap today, but an
  edge saved with `sourceHandle: "__control_output__"` would deliver the
  event twice; nothing validates control-edge source handles.
- **`MemoryDurableInboxStore` is O(n) per operation** over one flat array —
  acceptable for tests, but it is also the default store used by
  `TriggerWakeupService` in production paths, and `TriggerInput` records
  accumulate until an explicit `cleanupProcessed` call.

## What is solid

Cycle handling is sound end-to-end (data cycles rejected by the
correlation topo sort, self-loops by `validateEdgeEndpoints`, control
cycles by DFS). The double-EOS guard (`_eosSentEdges`), per-unique-controller
`__control__` counting, the FIFO queue for control responses replacing the
old single-slot resolver, the held-control-events fix in
`_waitForDataInputs`, and the pending-start dedup in
`TriggerWorkflowManager` all show earlier races were found and fixed with
regression tests. The message-retention cap and audio-chunk exclusion in
`_emit` are well reasoned. The Stryker annotations indicate real mutation
coverage.

## Suggested priority

1. Flag hydration OR-logic (#2) — silent wrong execution mode on saved
   graphs.
2. Controlled-node deadlock (#4) and control-response attribution (#5) —
   hangs and wrong agent results at runtime.
3. Streaming-migration last-value collapse (#11) + duplicate-key silent drop
   (#12) — silent data loss; at minimum emit warnings.
4. `pushInputValue` transformation bypass (#3) and dispatch fallback leak
   (#6).
5. Edge status regression (#1) — small, contained UI fix.
6. Backpressure story (#10) — decide on a default `bufferLimit` and a
   bucket-level cap that actually applies to buffered nodes.
