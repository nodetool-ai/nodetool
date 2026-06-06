# Automatic Message Correlation: Replacing `sync_mode`

Status: **Default-on for the TypeScript scheduler.** Correlation-aware scheduling is now the only kernel scheduling path; the `NODETOOL_USE_CORRELATION` rollout flag and user-facing `sync_mode` selection have been removed. The Python stdio bridge work (PR 4a/4b) is still outstanding — Python-backed nodes must declare explicit `input_mode` / `output_correlation` metadata via the bridge to participate, and workflows whose Python nodes lack that metadata will fail correlation analysis at load time.

| PR  | Description                                            | Status         |
| --- | ------------------------------------------------------ | -------------- |
| 0   | Inventory and tests                                    | Done            |
| 1   | Add metadata, no scheduler change                      | Done            |
| 2   | Propagate envelopes behind the flag                    | Done            |
| 3   | Correlated buffered scheduler                          | Done (steps 1–4) |
| 4   | Migrate stream nodes, Zip/Cross                        | TS-side done; Python bridge (4a/4b) outstanding |
| 5   | Make correlation default                               | TS scheduler done; Python bridge parity pending 4a/4b |

The correlation analyzer (`packages/kernel/src/correlation-analysis.ts`), the
correlated buffered scheduler (`NodeActor._runCorrelated`), lineage signal
recording (`NodeInbox.signalLineageDone`/`signalLineageScopeClosed`), pending
key limits, EOS-driven `lineage_scope_closed` synthesis, and the
`ZipNode`/`CrossNode` base nodes are all on `main` in TypeScript. Correlation is always enabled; the legacy `sync_mode` scheduler is no longer used.

## Problem

The workflow kernel used to expose `sync_mode: "on_any" | "zip_all"` as a per-node property. Users did not know which value to pick, and the right behavior depended on lineage they could not see.

The current design fails in three ways:

1. **`zip_all` joins by FIFO order instead of identity.** If two branches have
   different latency, branch A item N can be paired with branch B item M. The
   workflow completes, but the result is wrong.

2. **`is_streaming_output` mixes unrelated meanings.** It currently means at
   least three things:
   - an invocation emits multiple logical items (`ForEachNode`, folder loaders,
     splitters),
   - an invocation emits chunks of one logical item (LLM token streams, realtime
     audio),
   - an input should fire per arriving item (`IfNode`, `RerouteNode`, filters,
     stream operators).

3. **Some streaming metadata describes desired behavior, not actual behavior.**
   `ClaudeAgentNode`, `SummarizerNode`, and `TextToSpeechNode` declare a `chunk`
   output and set `isStreamingOutput = true`, but their current `process()`
   implementations accumulate results and return one value.

The replacement must make joins deterministic without adding a new user-facing
knob.

## Goals

- Remove `sync_mode` from the user model.
- Join messages by correlation identity, not arrival order.
- Keep constant/config inputs reusable across correlated items.
- Preserve stream-processing nodes that consume via `run()`.
- Keep old workflows loading while ignoring saved `sync_mode` fields.

## Non-goals

- Inferring cartesian products between unrelated iteration sources.
- Keeping `sync_mode` semantics forever.
- Solving global distributed tracing. Correlation is an internal scheduler
  primitive.

## Proposal

### 1. Split input mode from output correlation

Do not replace the old flags with one node-level field. Execution mode and
output correlation are separate concerns.

```ts
type InputMode =
  | "buffered"    // actor gathers correlated inputs, then calls process/genProcess
  | "stream"      // node implements run() and drains NodeInputs itself
  | "controlled"; // existing control-edge execution

type OutputKind =
  | "single"      // one logical output per invocation; inherits invocation lineage
  | "iteration"   // emits logical items; each item adds a correlation token
  | "chunk"       // emits chunks of one logical item; inherits invocation lineage
  | "forward"     // emits per source envelope; copies that source lineage
  | "aggregate";  // stream-mode node consumes child items and emits at a collapsed scope

type CollapseSpec = "innermost";

interface OutputCorrelation {
  kind: OutputKind;

  /** Input handle name, or "__execution__" to use the node execution scope. */
  source: string;

  /** Outputs with the same group share one iteration token. */
  group?: string;

  /** Required for aggregate outputs. */
  collapse?: CollapseSpec;
}

interface NodeDescriptor {
  input_mode?: InputMode;
  output_correlation?: Record<string, OutputCorrelation>;
}
```

`output_correlation` is per output handle. It covers cases that a flat
`output_kind` cannot express:

- `ForEach.output` and `ForEach.index` use `kind: "iteration"` and the same
  `group`, so both outputs carry the same item token.
- `Reroute.output` uses `kind: "forward"` and `source: "input_value"`.
- `Collect.output` uses `kind: "aggregate"`, `source: "input_item"`, and
  `collapse: "innermost"`.
- Agent nodes can mark `chunk` as `chunk` and final `text` as `single`.

Every output descriptor has an explicit `source`. Use an input handle name or
`source: "__execution__"` when the output should inherit the node execution
scope. SDK authoring helpers may infer a source for one-input nodes, but the
serialized descriptor produced by the registry is always explicit. Graph
validation should not infer omitted sources from topology except when loading
legacy descriptors. Workflow JSON should not persist generated
`output_correlation` as authoritative state; descriptors are recomputed from the
registry at load. If older workflow JSON contains persisted `output_correlation`,
treat it as a cache and overwrite it from current node metadata.
For `forward`, `source` is required and must name a single-edge handle; a
multi-edge list has no single envelope to copy. For `aggregate`, `source` and
`collapse` are required, and the node must use `input_mode: "stream"`. Buffered
nodes may not declare aggregate outputs, and non-aggregate buffered outputs may
not narrow to a strict-prefix scope of the invocation scope. When non-forward
outputs name a multi-edge list as `source`, they use the list handle's effective
scope, not any individual source edge lineage.

Grouped iteration outputs need an explicit emission contract:

- For `process()` and `genProcess()`, each returned/yielded record is one
  emission frame. All handles in the same `iteration` group that appear in that
  frame share one actor-minted token. A plain `process()` can mint at most one
  token per group; nodes that emit multiple logical items must use
  `genProcess()` or `run()`. In grouped iteration outputs, a handle named
  `index` is reserved for the actor. The actor fills it with the minted token
  index. During migration, if a legacy node frame supplies `index`, the actor
  overwrites it under the correlation scheduler and records a warning; after the
  node inventory is migrated, supplying it becomes a validation error.
- For `run()` nodes, grouped iteration output must use
  `outputs.emitGroup(group, values)`. The actor owns the correlation token and
  its `index`; the node does not pass a correlation index. If a group contains a
  conventional `index` output handle, the actor emits the token index as that
  output value. If `values` supplies `index` during migration, the actor
  overwrites it and warns; after the node inventory is migrated, this becomes a
  validation error. Calling `outputs.emit()` on a grouped iteration handle is an
  error under correlation.
- If a frame emits one handle in a group but omits a sibling handle, the actor
  sends `lineage_done` for the missing sibling at the minted token.

`isStreamingInput` and `isStreamingOutput` remain compatibility fields during migration. `sync_mode` is ignored when present in saved workflows.

### 2. Represent lineage as root-id to item-token mappings

A set of event IDs is not enough because static analysis works with root IDs.
Use a serializable mapping:

```ts
interface CorrelationToken {
  index: number;
}

type CorrelationLineage = Readonly<Record<string, CorrelationToken>>;

interface MessageEnvelope {
  data: unknown;
  metadata: Record<string, unknown>;
  timestamp: number;
  event_id: string;
  correlation_lineage: CorrelationLineage;
  source_edge_id: string;
}
```

The key in `correlation_lineage` is the iteration root id. The default root id
is `${node.id}:${group}` for grouped iteration outputs and `${node.id}:${handle}`
for ungrouped iteration outputs. Runtime keys never depend on JavaScript object
property order: every projected lineage is serialized canonically in static
scope order as `root=index` pairs.

`index` is mandatory. `Zip` depends on it, and external streaming inputs can
mint it from push order. Indexes are scoped by parent lineage: a nested splitter
gets a separate counter for each distinct parent lineage, so each parent item
starts at index 0.

The actor assigns iteration tokens. Within one workflow run, it keeps a
monotonic counter per `root id + exact parent lineage` and does not reset that
counter for repeated invocations with the same parent key. A different parent
lineage has a different counter and starts at index 0. Counters reset at
workflow run start. This prevents token collisions when a buffered node consumes
several `chunk` messages that share one lineage and emits iteration items from
each invocation.

Minting rules:

- `iteration`: preserve the base lineage and add this output group's root token.
  For nested iterations, the child item keeps its parent tokens.
- `chunk`: inherit the base lineage. Chunk sequence metadata uses
  `metadata.chunk_group_id` and `metadata.chunk_index`; it is not part of
  `correlation_lineage` and is not used for automatic joins. Static analysis
  marks chunk outputs as `repeats_per_key`. Nodes that need to correlate two
  chunk streams must use a stream node or aggregate first.
- `forward`: copy the `source` envelope lineage unchanged.
- `single`: inherit the node invocation lineage unless `source` narrows it.
- `aggregate`: stream-mode aggregators start from the `source` lineage, drop the
  root(s) named by `collapse`, and emit at the remaining parent scope when the
  collapsed scope closes.

### 3. Static correlation analysis

At graph load time, compute static correlation metadata for each incoming edge
and each node output: an ordered scope plus a `repeats_per_key` flag. A scope is
an ordered root chain from outermost parent to innermost child. The runtime
lineage is a token map, but the static scope supplies the order needed for
prefix checks, projection, and `collapse: "innermost"`.

For each output handle:

- `source` means “start from this input handle's scope”. `source:
  "__execution__"` means “start from the node execution scope”.
- `single` and `forward` propagate the base scope and the base
  `repeats_per_key` flag.
- `chunk` propagates the base scope and always sets `repeats_per_key`.
- `iteration` propagates the base scope plus the declared output group root and
  clears `repeats_per_key` because the new root distinguishes emitted items.
- `aggregate` is valid only on `input_mode: "stream"` nodes and propagates the
  base scope after applying `collapse`; `innermost` drops the last root in the
  ordered base scope. Aggregates clear `repeats_per_key` for the collapsed root.
- `Zip` and `Cross` are the only nodes allowed to combine incomparable scopes;
  both mint a new iteration root while preserving the longest common parent
  prefix. Their output scope is `commonParentPrefix + [${node.id}:zip]` or
  `commonParentPrefix + [${node.id}:cross]` respectively.

For each node, let `S_{H,E}` be the scope for source edge `E` feeding input
handle `H`, and `R_{H,E}` be its `repeats_per_key` flag. A single-edge handle's
effective `S_H`/`R_H` comes from that edge. A multi-edge `list[...]` handle's
effective `S_H` is the largest source-edge scope when all source-edge scopes for
that handle are comparable by prefix; its effective `R_H` is true if any source
edge repeats for that key. Incomparable list source scopes reject the graph.

Static analysis also computes close-barrier contributors for each output handle:

- If `source` names one input handle, contributors are the source edges feeding
  that handle whose scopes can satisfy the output scope.
- If `source: "__execution__"`, contributors are all connected data source edges
  with non-empty scopes that are prefix-comparable with the output scope.
- For multi-edge list sources, each incoming source edge is a separate
  contributor.
- Empty-scope config edges are not close-barrier contributors.

Static analysis also computes possible child roots for EOS synthesis. This is a
fixed-point pass over the DAG:

- `iteration` outputs contribute their own root id.
- `single`, `chunk`, and `forward` outputs inherit the possible child roots of
  their explicit `source` input.
- `aggregate` outputs remove the collapsed root from the source's possible child
  roots.
- `Zip` and `Cross` outputs contribute their newly minted root.

Cycles in this analysis reject the graph. The runner passes contributor sets,
possible child roots, ordered input scopes, ordered output scopes, and
`repeats_per_key` flags to each inbox/actor. Inboxes never infer prefix order
from `CorrelationLineage`'s record shape; every projection uses the ordered
scope from `_analyzeCorrelation`. Missing a contributor or child root is a
correctness bug, so `_analyzeCorrelation` should expose them in tests for
forward chains, diamonds, and multi-edge list handles.

Validation rules:

1. Empty scopes are constants/config and can be reused anywhere.
2. For non-empty input scopes on the same node, every pair must be comparable by
   prefix. This allows nested iteration and diamonds.
3. If two non-empty scopes are incomparable, reject the graph:

   > Node `N.id` inputs `a` and `b` come from independent iteration sources.
   > Add `Zip` or `Cross` to declare how they should join.

The node execution scope is the largest non-empty input scope. If there are
multiple largest scopes, validation has already rejected the node.

Metadata validation also rejects:

- outputs that omit `source`,
- `forward` outputs with `source: "__execution__"` or whose
  `source` is a multi-edge list handle,
- `aggregate` outputs without `source` or `collapse`,
- `Zip` inputs whose tokens lack `index` or whose scope has more than one
  differing root after the common parent prefix; this is a graph-load error,
- output groups that assign the same handle to multiple iteration roots,
- multi-edge list handles whose incoming edge scopes are not comparable by
  prefix,
- aggregate outputs on buffered nodes,
- non-aggregate buffered outputs whose declared output scope is a strict prefix
  of the node invocation scope,
- buffered nodes that would use a `repeats_per_key` chunk input as a strict
  prefix sticky value,
- buffered nodes with more than one `repeats_per_key` input at the execution
  scope,
- buffered nodes whose only `repeats_per_key` execution-scope input is a
  multi-edge list handle. Repeating list handles need stream/aggregate handling
  in v1.

With one repeating single-edge max-scope input, same-scope non-repeating inputs
are side inputs reused for each repeated message with that key. Outputs that do
not add an iteration root or aggregate the repeated input inherit
`repeats_per_key`, so downstream nodes apply the same validation. Chunk-to-chunk
alignment needs an explicit stream/aggregate node because chunk sequence metadata
is not correlation lineage. Validation errors for these cases should name the
handles and suggest inserting `Collect`/`Last`, a stream-aware node, or an
explicit join.

Examples:

- Diamond from one `ForEach`: allowed. Both paths have the same scope.
- File item plus records from a nested splitter: allowed. `[file]` is a prefix
  of `[file, record]`; the file value is reused for each record with the same
  file token.
- Two unrelated `ForEach` branches into one node: rejected unless joined by
  `Zip` or `Cross`.

### 4. Runtime readiness

Each inbox stores data by handle and by projected correlation key.

For a node with execution scope `S_N`, only connected data handles participate
in readiness. Unconnected properties use node defaults and are merged before
execution. A connected optional handle must be declared optional in metadata; it
still participates in readiness, and its default is used only after the source
edge is done for key `K` without producing a value. Defaults never let a
connected optional edge fire early while that edge can still produce `K`.

1. Project every arriving envelope's lineage to the handle scope `S_H`.
2. Keep sticky values only for non-repeating handles whose scope is a strict
   prefix of `S_N`, plus empty-scope handles. `repeats_per_key` handles are
   never sticky.
3. Candidate firings normally come from buffered messages on handles whose scope
   equals `S_N`.
4. If exactly one max-scope handle is `repeats_per_key`, it becomes the driver.
   Candidate firings come from that driver, and other non-repeating max-scope
   handles become side inputs that are sticky for the exact same key. Driver
   messages buffer until every side input has produced, dropped, or closed that
   key. A required side input that closes without a value blocks the key and
   propagates `lineage_done`; an optional side input uses its default. Receiving
   more than one side-input value for that key before the driver scope closes is
   an error.
5. A node fires for candidate key `K` when every input handle has:
   - a buffered message for `K` if `S_H === S_N` and the handle is the driver or
     there is no repeating driver,
   - a sticky side-input value for `K` if `S_H === S_N` and another handle is the
     repeating driver,
   - a sticky value for `K` projected to `S_H` if `S_H` is non-repeating and a
     strict prefix of `S_N`, or
   - an empty-scope sticky value if `S_H` is empty.

Without a repeating driver, max-scope messages are consumed for a firing and are
never satisfied from sticky state. A non-list, non-repeating handle may receive
at most one value for a given key; a duplicate before that key's scope closes is
an execution error. Coarser-scope, side-input, and empty-scope values stay
sticky and are reused for descendant keys or repeated chunks. Chunk messages are
allowed only as the single repeating max-scope driver for a buffered node; any
chunk-to-chunk alignment must be expressed with a stream/aggregate node first.

If all input scopes are empty, the actor runs once after all required inputs have
a value.

Multi-edge `list[...]` inputs are tracked per incoming edge, not just per
handle. For candidate key `K`, each source edge is evaluated at `K` projected to
that edge's own scope. An edge whose scope equals the handle's effective scope
must produce, drop, or close that exact key. An edge whose scope is a strict
prefix can satisfy descendant keys with a sticky value for the projected parent
key; if that parent key is dropped or closes without a value, that source is
omitted from the list for matching descendants. Values that satisfy `K` are
aggregated. A source edge is undecided for projected key `P` when it has not
produced a value for `P`, sent `lineage_done` for `P`, or sent a
`lineage_scope_closed` whose parent/closed-root covers `P`. The actor must not
fire a partial list while any source edge for the projected key is still open
and undecided.

The actor passes both plain input values and the triggering envelopes into the
execution layer so outputs can inherit the correct lineage.

### 5. Stream nodes need envelope-aware APIs

`run()` nodes cannot preserve correlation if they only receive raw values. Add
envelope-aware helpers while keeping the existing raw-value helpers:

```ts
for await (const envelope of inputs.streamWithEnvelope("input_item")) {
  await outputs.forward("output", envelope, transform(envelope.data));
}

await outputs.emit("audio", value, { lineage });
await outputs.emitGroup("item", { output: item });
await outputs.drop("output", envelope);
```

Rules for stream nodes:

- Forwarding/filtering nodes use `outputs.forward()` or `outputs.drop()` for
  every consumed envelope.
- Aggregators declare the root(s) they collapse and emit with the parent
  lineage.
- Stream nodes with grouped iteration outputs use `outputs.emitGroup()` so
  sibling handles share the same token.
- Existing `outputs.emit(slot, value)` remains valid during migration. In PR 2
  it is warn-only while envelopes are propagated but the correlated scheduler is
  not active. Starting in PR 3 for correlated buffered execution and PR 4 for
  stream nodes, it is allowed only when the caller supplies explicit lineage or
  the output metadata names a single-edge `source` handle and the current
  invocation consumed exactly one envelope from that source edge. That envelope
  is the current source envelope. Otherwise it is an error; on grouped iteration
  handles it is always an error.

### 6. Done, dropped-key, and scope-close propagation

Per-handle EOS (`markSourceDone`) is still needed, but it is not enough for
correlation. A filter can consume item `K` and intentionally emit nothing; a
join waiting for `K` must learn that the key is unavailable before source EOS.
An iteration can also emit zero child items for parent `P`; downstream
aggregators need to know that the child subtree under `P` is closed.

Add two internal control-plane messages:

```ts
interface LineageDone {
  type: "lineage_done";
  source_edge_id: string;
  output: string;
  lineage: CorrelationLineage;
}

interface LineageScopeClosed {
  type: "lineage_scope_closed";
  source_edge_id: string;
  output: string;
  parent_lineage: CorrelationLineage;
  closed_root: string;
}
```

Every envelope delivered to an inbox must have `source_edge_id`; source nodes
and external inputs use synthetic edge ids when there is no saved edge id.

Synthetic `source_edge_id`s must be deterministic:
`${sourceNodeId}:${handle}->${targetNodeId}:${targetHandle}` when no saved edge
id exists, and `external:${inputName}:${handle}` for pushed external inputs.

`lineage_done` is keyed by source edge and exact projected lineage. It means
“this source edge will not produce a value for this concrete key on this
handle.”

`lineage_scope_closed` is keyed by source edge, parent lineage, and child root.
It means “this source edge will not produce any more descendants for
`closed_root` under this parent key on this handle.” It is emitted even when no
child token was minted.

Data, `lineage_done`, and `lineage_scope_closed` events for a source edge are
serialized through the same per-edge queue. A close event is delivered only
after all earlier data/done events for that source edge have reached downstream
inboxes. A close from one edge is never global; downstream close barriers wait
for all contributor edges for the output scope.

Propagation rules:

- After a buffered invocation finishes, the actor sends automatic
  `lineage_done` only for non-aggregate outputs whose output scope equals the
  invocation scope and did not emit for that invocation key.
- Iteration output groups are handled per minted token: if one handle in the
  group emits a token and a sibling handle does not emit that token, the actor
  marks the missing sibling handle done for that token.
- When an iteration group finishes for a non-repeating invocation parent key,
  the actor emits `lineage_scope_closed` for that group under the parent key,
  even if it minted zero child tokens. If the iteration group is driven by a
  `repeats_per_key` input, this close is deferred until the repeating driver
  closes for that parent key.
- Outputs whose scope is a strict prefix of the invocation scope are never
  marked done just because one child invocation did not emit. Aggregators close
  those parent-scope outputs only when their source scope closes or when the
  node explicitly calls `outputs.drop()`.
- `outputs.drop(slot, envelope)` sends `lineage_done` for that source key.
- If a correlated actor receives `lineage_done` for a required max-scope handle
  before the node can fire for that key, it propagates `lineage_done` only for
  outputs whose scope is equal to that blocked scope or has that blocked scope
  as a prefix. For iteration outputs, it also emits `lineage_scope_closed` for
  the child root under the blocked parent key. It must not collapse a child-key
  drop into a parent-scope done event.
- If a strict-prefix handle closes without a sticky value, all pending descendant
  keys that need that parent key are marked done and propagated.
- Non-aggregating nodes propagate `lineage_scope_closed` only after a close
  barrier is satisfied for the output scope: every input handle/source edge that
  can contribute to that output scope has produced, dropped, or closed the
  parent key, and pending firings for that key have drained. The inbox tracks
  this per `(output scope, parent key)` using the contributing source-edge set
  from static analysis. For `forward` outputs with one `source`, the barrier is
  just that source edge. For multi-input maps/diamonds, a close from one branch
  is not enough.
- Iteration nodes close their child root under a parent key only after the same
  close barrier is satisfied for the parent scope.
- Stream-mode aggregators that collapse a child root finalize their parent-key
  output when they receive `lineage_scope_closed` for that child root and parent
  key.
- Source EOS synthesizes any missing `lineage_scope_closed` events for child
  scopes that the source edge could have produced. `_analyzeCorrelation` passes
  each actor/EOS handler the possible child roots per outgoing source edge so
  EOS does not infer this from runtime lineages. After synthesizing closes, EOS
  drains remaining buckets and reports warnings for synthesized closes with node
  id, handle, and key. Downstream nodes must receive a close or done event, not
  wait forever.
- Inboxes enforce safety limits as v1 backpressure: `max_pending_keys` and
  `max_pending_messages_per_key` are configurable, default to conservative
  finite values, and hitting either limit is a terminal workflow execution error.
  Repeating-driver buffers count against these limits.
- Close barriers also have a configurable timeout. The timer starts only after
  all relevant upstream sources have reached EOS and their per-edge queues have
  drained; it does not apply to active long-running aggregations. If the barrier
  still waits past the timeout, the workflow fails with a diagnostic listing the
  missing source-edge ids.

This makes dropped keys and empty child scopes transitive: downstream joins and
aggregators do not wait for a node that never invoked or an iteration that
produced no children.

### 7. Explicit joins

`Zip` and `Cross` are the escape hatches for independent iteration sources.

- `Zip` joins inputs by mandatory `index` within their common parent prefix. V1
  only accepts one differing iteration root per input after that prefix. For
  example, `[file, row]` can zip with `[file, page]`, but `[file, page, block]`
  must be aggregated or zipped in stages first. If one side sends
  `lineage_done` for an index, `Zip` drops that pair and propagates
  `lineage_done` for its own output key. It errors only when a side's scope
  closes while the other side still has pending indexes that were neither
  matched nor explicitly dropped. `Zip` also enforces its own configurable
  `max_unmatched_pairs` limit and reports a Zip-specific error before generic
  inbox limits trigger. Its root id is `${node.id}:zip`, and its token
  index is the matched input index.
- `Cross` emits the cartesian product within the common parent prefix. V1
  requires a `max_output_count` property with a finite default; it buffers both
  sides until their scopes close for the common parent key and errors before
  emitting more than the configured maximum. Its root id is `${node.id}:cross`,
  and its token index is the emitted product order within the common parent key.

Both nodes output a new `iteration` root, so downstream nodes see one ordinary
correlated stream instead of multiple independent roots.

## Kernel changes

- `packages/protocol/src/graph.ts`
  - Add `InputMode`, `OutputKind`, `CollapseSpec`, `OutputCorrelation`, and
    `output_correlation?: Record<string, OutputCorrelation>`.
  - Keep `is_streaming_input` and `is_streaming_output` as compatibility fields during migration.

- `packages/node-sdk/src/base-node.ts`
  - Add `static readonly inputMode` and `static readonly outputCorrelation`.
  - Continue emitting old flags from new metadata for compatibility.
  - Keep execution detection based on explicit metadata, not `genProcess`
    existence. `BaseNode` already defines a default `genProcess` wrapper, so PR 1
    must not introduce any behavior path that treats its presence as streaming.

- `packages/kernel/src/runner.ts`
  - Run `_analyzeCorrelation` for every workflow before execution.
  - Store input/output scopes, `repeats_per_key`, possible child roots per
    outgoing source edge (including transitive roots through `forward` chains),
    and close-barrier contributor source-edge sets per node handle/output
    handle.
  - Enforce comparable-scope validation and explicit `Zip`/`Cross` joins.

- `packages/kernel/src/inbox.ts`
  - Extend `MessageEnvelope` with `correlation_lineage`.
  - Add bucket helpers keyed by source edge and projected lineage.
  - Track close barriers by contributing source-edge set for each output scope
    and parent key.
  - Add `lineage_done`, `lineage_scope_closed`, and pending-key limits.

- `packages/kernel/src/actor.ts`
  - Use `_runCorrelated` for buffered execution.
  - Preserve triggering envelopes through input gathering.
  - Route output envelopes with per-output lineage rules.
  - Propagate `lineage_done` and `lineage_scope_closed` when a key cannot invoke
    the node.
  - Keep controlled execution separate.

- `packages/kernel/src/io.ts` and `packages/runtime/src/node-executor.ts`
  - Add envelope-aware `NodeInputs`/`NodeOutputs` APIs for stream nodes.

- Web, DSL, examples, snippets, and tools
  - Stop teaching users to set `sync_mode` once correlation is the default.
  - Keep loading saved workflow JSON that still contains `sync_mode`.

## Migration plan

### PR 0 — Inventory and tests

Classify every node that currently sets `isStreamingInput`,
`isStreamingOutput`, or old `sync_mode` metadata. There is no generic legacy-flag to
`output_correlation` mapping: registry metadata is authoritative under the
correlation scheduler, and legacy saved flags are used only by the old scheduler.
Graph validation under correlation rejects node types without explicit
correlation metadata. The inventory must also identify multi-input nodes whose
outputs need explicit `source`, optional connected inputs that must emit
done/close/default semantics, grouped iteration nodes with `index` outputs that
must become actor-filled, and workflows that consume chunk/final outputs from
the same logical stream. Add tests that capture current behavior for:

- FIFO mispairing with different branch latencies,
- one iteration source with a constant input,
- diamond topology from one iteration source,
- nested iteration with parent reuse,
- filtered-out items,
- empty iterations and child-scope close propagation,
- stream aggregators (`Collect`, `Last`, `Count`).

### PR 1 — Add metadata, no scheduler change

Add `input_mode` and per-output `output_correlation` to descriptors. Keep the
current kernel behavior. Generate old flags from new metadata where possible,
but keep old fields accepted everywhere.

Classify aspirational streamers by what they do today. Do not make this PR both
a metadata change and a behavior change. Nodes such as `ClaudeAgentNode`,
`SummarizerNode`, and `TextToSpeechNode` stay `single` unless they actually emit
chunks; stale `chunk` ports that do not emit should be marked
deprecated/unemitted in metadata or cleaned up in a later PR. Record every
grouped iteration node with an `index` output (`ForEach`, splitters, loaders`).
PR 1 metadata is inert under the old scheduler: node code may still emit
`index`, and actor-reserved `index` enforcement is disabled until PR 3. PR 3
must convert those nodes so actor-filled `index` handles are the only values
visible downstream when the correlation scheduler is active.

### PR 2 — Propagate envelopes behind a flag

Correlation runtime behavior:

- attach `correlation_lineage` to every `MessageEnvelope`,
- preserve envelopes through actor input gathering,
- preserve input envelopes through the actor boundary,
- route inherited lineage only for unambiguous cases: source nodes, nodes with
  one connected single-edge input handle, and explicit `outputs.forward()`
  calls,
- add envelope-aware stream APIs,
- the old `sync_mode` scheduler is removed from production execution.

Do not compute multi-input invocation lineage from old FIFO/`on_any` batches;
that starts in PR 3. Tests should assert edge/envelope propagation without
changing output values.

### PR 3 — Add the correlated buffered scheduler

Implement `_analyzeCorrelation` and `_runCorrelated` for buffered nodes under
correlation. Add `lineage_done`, `lineage_scope_closed`, and pending-key
limits. Convert grouped iteration nodes so actor-reserved `index` handles are
omitted from frames under the correlation scheduler; add validation that rejects
frames that still provide them.

Required tests:

- `_analyzeCorrelation` exposes ordered scope keys and close-barrier contributor
  sets for diamonds and multi-edge list handles,
- same-root branch joins are order-independent,
- constants stay sticky across correlated keys,
- nested child keys reuse parent values,
- max-scope inputs are never satisfied from sticky state,
- filtered keys drain and propagate done without hanging,
- empty iteration scopes close and let aggregators finalize,
- diamond where one branch's nested iteration emits zero items,
- `forward` plus multi-input diamond contributor sets,
- `source: "__execution__"` contributor sets for mixed-scope inputs,
- incomparable roots are rejected with an actionable error.

### PR 4 — Migrate stream nodes and add explicit joins

Update `run()` nodes to use `streamWithEnvelope`, `outputs.forward`,
`outputs.drop`, or aggregate emission. Convert aggregator nodes (`Collect`,
`Last`, `Count`, and any similar nodes from PR 0) to `input_mode: "stream"` if
they are not already. Add `Zip` and `Cross` nodes and tests. Under the
correlation flag, `Zip` workflows are valid only when all upstream paths can
produce `lineage_done`/`lineage_scope_closed`; graph validation should reject
unconverted upstream paths feeding `Zip`.

Convert selected real workflows to run with correlation in CI.
Python-backed nodes must carry correlation metadata/events through the stdio
bridge by this PR.

Stage the Python bridge work if it threatens the PR 4 scope:

- PR 4a: add a stdio protocol version/capability handshake during worker
  readiness (`{ protocol_version: 2, capabilities: ["correlation"] }` after
  `NODETOOL_STDIO_READY`); add Python `BaseNode.input_mode` and
  `BaseNode.output_correlation` metadata; extend stdio msgpack data messages
  with an optional `envelope` object containing `correlation_lineage` and
  `source_edge_id`; update TS bridge deserialization. Older workers without the
  correlation capability run only with the old scheduler.
- PR 4b: add `lineage_done` and `lineage_scope_closed` over stdio, guarded by
  the negotiated capability, then add Python worker tests for iteration, chunk,
  forward, aggregate, and dropped keys across the bridge.

PR 5 ships ahead of PR 4b for the TypeScript scheduler: the legacy fallback
is gone, so Python-backed nodes that don't yet advertise correlation metadata
through the bridge will fail analysis at load time. PR 4a/4b restores parity
by adding the protocol-version handshake and lineage signals over stdio.

### PR 5 — Make correlation default

Correlation is always on. Hide `sync_mode` in the UI and DSL. Keep accepting saved `sync_mode` fields on load without warning.

Removed from production behavior:

- `sync_mode` selection,
- the correlation rollout flag,
- legacy scheduler selection.

## Remaining decisions

1. **Metadata authoring ergonomics.** The descriptor shape above is explicit;
   node authors still need helpers so common cases (`single`, one-input
   `forward`, grouped `iteration`) stay terse.

2. **Backpressure.** Pending-key limits prevent unbounded memory, but a future
   PR should turn those limits into upstream backpressure instead of hard
   execution errors.

3. **Python worker rollout.** Python bridge compatibility remains a rollout concern for Python-backed nodes that need full output correlation metadata, lineage, `lineage_done`, and `lineage_scope_closed`.
