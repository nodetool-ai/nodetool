# Automatic Message Correlation: Replacing `sync_mode`

Status: **Draft**. Branch: `claude/auto-correlate-messages-1brnD`.

## Problem

The workflow kernel currently exposes `sync_mode: "on_any" | "zip_all"` as a
per-node property (`packages/protocol/src/graph.ts:55,91`). Users don't
understand it: they don't know which value to pick, when, or why their pipeline
is firing too often / not often enough. Three concrete failures of the current
design:

1. **`zip_all` joins by FIFO arrival order, not by what messages actually belong
   together.** If two upstream branches have different latencies, items from
   iteration N on branch A get paired with items from iteration M on branch B.
   This is invisible to the user — the workflow just produces subtly wrong
   results. (`packages/kernel/src/actor.ts:444` `_gatherZipAll`.)

2. **`is_streaming_output` is overloaded with three distinct meanings**, and
   the codebase already shows the strain:
   - "yields multiple semantically distinct items per invocation" — iteration
     roots like `ForEachNode`, `ListGeneratorNode`, `Split*Node`,
     `Load*FolderNode`. Use `genProcess`, yield in a loop.
   - "yields multiple chunks of one logical output" — token-streaming LLMs
     (`AgentNode`), realtime TTS/STT. Use `genProcess` over a provider stream.
   - "fire once per arriving input rather than wait for all" — `IfNode`,
     `RerouteNode`, and the stream operators (`TakeNode`, `DropNode`,
     `FilterEqualNode`, `ChunkNode`, etc.). Use plain `process()`, rely on
     `isStreamingInput=true` to coax the actor into per-arrival firing.

3. **Aspirational-but-incomplete streamers.** `ClaudeAgentNode`
   (`packages/base-nodes/src/nodes/anthropic.ts:82`), `SummarizerNode`
   (`packages/base-nodes/src/nodes/agents.ts:1355`), and `TextToSpeechNode`
   (`packages/base-nodes/src/nodes/audio.ts:1255`) declare
   `isStreamingOutput = true` and a `chunk` output port, but their `process()`
   accumulates the upstream stream into a single value and returns once.
   The flag is documentation, not behavior.

The user-facing knob (`sync_mode`) is a leaky abstraction over execution rules
that depend on something the user can't see: the lineage of each input handle.

## Proposal

### 1. Replace `is_streaming_output` with explicit `output_kind`

```ts
type OutputKind =
  | "single"      // fires once, emits one record (default; today's process())
  | "iteration"   // mints fresh correlation IDs per emitted item (iteration root)
  | "chunks"      // emits multiple chunks of one logical item, all share correlation
  | "forward";    // fires once per arriving message, propagating correlation unchanged
```

Each meaning of the overloaded flag now has its own value. `is_streaming_input`
goes away — `forward` and stream-consuming nodes are detected by `output_kind`
plus whether the node implements `genProcess`.

### 2. Correlation IDs

Every `MessageEnvelope` (`packages/kernel/src/inbox.ts:20`) gains a
`correlation_lineage: ReadonlySet<string>` field. Today it carries `event_id`
(random UUID per message); the new field is the set of iteration-source event
IDs that this message descends from.

Minting rules:
- `iteration` nodes: each emitted item gets `correlation_lineage = {new_id}`
  where `new_id` is the iteration-source's `event_id`.
- `chunks` nodes: every chunk inherits `correlation_lineage` from the message
  that triggered the invocation.
- `forward` nodes: each emission inherits `correlation_lineage` from the
  triggering input message.
- `single` nodes: emissions inherit the union of all triggering inputs'
  lineages.

### 3. Join semantics

The actor's input-gathering step (`_gatherZipAll` today) becomes:

```
for each input handle H:
  determine H's iteration-root lineage L_H by static analysis (see §4)
  bucket arrivals into per-correlation-ID queues, keyed by lineage ∩ L_H

fire when:
  for some correlation key K, every handle either:
    (a) has a buffered message with lineage matching K, or
    (b) has no iteration-root ancestor (constant / config input) and has
        a sticky last-value
```

This collapses `on_any` / `zip_all` into one rule. The user no longer chooses;
the lineage of the inputs determines what "ready" means.

### 4. Static lineage analysis

At graph compile time (`runner.ts:_analyzeStreaming` →
`_analyzeCorrelation`), walk back from each input handle of each node:

```
walk(handle):
  if upstream node has output_kind == "iteration":
    return {upstream_node_id}
  if upstream node has output_kind in {"chunks", "forward", "single"}:
    return union of walk(each input handle of upstream node)
  if no upstream (constant / config): return {}
```

The result `L_H` is the set of iteration-root nodes whose IDs can possibly
appear in messages arriving on handle H. This is a graph property, computed
once. The runtime uses it to decide whether a handle participates in
correlation joins or in sticky-fallback.

### 5. Validation rules

At graph load time, for each node N:
- For each input handle H, compute `L_H`.
- If `|L_H| > 1` for any handle, reject the graph with:
  > Node `N.id` input `H` receives messages from multiple iteration sources
  > (`L_H`). Join them explicitly with a `Zip` or `Cross` node.
- If two input handles H1, H2 of N have `L_H1 ≠ L_H2` and both are non-empty,
  reject with:
  > Node `N.id` inputs `H1` and `H2` come from different iteration sources.
  > Add a `Zip` (matching-correlation) or `Cross` (cartesian) node to express
  > how they should join.

The opt-in `Zip` / `Cross` nodes are the escape hatch for users who genuinely
need cross-source joins. They declare their join semantics explicitly.

### 6. Termination

Today: `inbox.markSourceDone()` decrements an open-source count per handle,
and `isFullyDrained()` returns true when buffers are empty and all sources
are done (`packages/kernel/src/inbox.ts:158,309`).

New: iteration roots emit a sentinel "lineage closed" event when their
`genProcess` exits. Downstream actors:
- Drain any partial join buckets keyed by that lineage (fire with sticky
  fallbacks if possible, or drop with a warning if a required handle never
  produced a matching item — this is observable and actionable, unlike
  today's silent FIFO mispairing).
- Garbage-collect the closed lineage's buckets.

This prevents unbounded buffering when an iteration source emits an item
that never reaches a downstream handle (e.g. filtered out by an intermediate
`FilterEqualNode`).

## Kernel changes

Concrete file-level changes:

- `packages/protocol/src/graph.ts` — remove `SyncMode`, add `OutputKind`. Add
  `output_kind?: OutputKind` to `NodeDescriptor` (default `"single"`).
- `packages/node-sdk/src/base-node.ts:122-123` — deprecate `isStreamingInput`
  and `isStreamingOutput`. Add `static readonly outputKind: OutputKind`.
- `packages/kernel/src/inbox.ts:20-25` — extend `MessageEnvelope` with
  `correlation_lineage: ReadonlySet<string>`. Add `markLineageClosed(sourceId)`
  alongside `markSourceDone`.
- `packages/kernel/src/inbox.ts:65` — replace per-handle FIFO with
  per-handle-per-correlation-key buckets. Sticky last-value lives at the
  handle level (one slot per handle), unchanged in shape.
- `packages/kernel/src/actor.ts:210-268` — collapse `_runBuffered` /
  `_runOnAny` / `_gatherZipAll` into a single `_runCorrelated` loop. Remove
  `_initialStickyHandles` (becomes per-correlation logic).
- `packages/kernel/src/runner.ts:1134` — replace `_analyzeStreaming` with
  `_analyzeCorrelation` computing `L_H` per handle and enforcing validation
  rules from §5.

## Migration plan

Three sequenced PRs:

**PR 1 — Introduce `output_kind`, leave behavior unchanged.**
Add the new field, derive a default from existing flags
(`isStreamingOutput=true` + `isStreamingInput=true` → `forward`;
`isStreamingOutput=true` + `genProcess` yields in a loop → infer
`iteration` vs `chunks` by manual review per node; everything else →
`single`). Update every node in `packages/base-nodes/`,
`packages/elevenlabs-nodes/`, etc. to declare `outputKind` explicitly.
Fix the three aspirational streamers (`ClaudeAgentNode`, `SummarizerNode`,
`TextToSpeechNode`) — convert each to a real `genProcess` (`chunks`) or
drop the `chunk` output and declare `single`. CI: typecheck + existing
tests pass with no behavior change.

**PR 2 — Implement correlation in the kernel behind a feature flag.**
Add `correlation_lineage` to `MessageEnvelope`, implement
`_analyzeCorrelation`, add `_runCorrelated` loop alongside the existing
path. Flag: `NODETOOL_USE_CORRELATION=1` env var. Convert a handful of
known iteration workflows to opt in. Verify joins are byte-identical
on simple cases and *more correct* on diverged-latency cases. Add tests
covering: single iteration source, nested iterations, constant inputs,
filtered-out items, lineage close + partial-bucket drain, multi-root
rejection.

**PR 3 — Make correlation the default, remove `sync_mode`.**
Flip the flag default to on. Remove `SyncMode`, `_runOnAny`,
`_gatherZipAll`, `_initialStickyHandles`. Strip `sync_mode` from the
schema; any saved workflow with the field gets it ignored on load
(no warning — it was always opaque). Remove `isStreamingInput` /
`isStreamingOutput` deprecation shims after one release.

## Open questions

1. **Multi-input correlation source.** What if a node has two inputs that both
   trace back to the *same* iteration root via different paths (a diamond)?
   Today this works because the FIFO orders match. With correlation IDs it
   also works trivially — same root ID on both paths matches. Worth a test
   case but no design change.

2. **Long-running iteration with backpressure.** Per-correlation buckets need
   bounded memory. If a downstream handle is slow, buckets pile up. Probably
   need a max-pending-per-handle limit with an explicit backpressure signal
   to the iteration source. Out of scope for v1; flag as future work.

3. **Skill nodes / agent subgraphs.** Do agent-spawned sub-workflows participate
   in correlation? Likely yes: the agent node `chunks` outputs inherit the
   triggering input's lineage. Sub-workflow execution is its own kernel run
   and doesn't share the parent's buckets. Confirm during PR 2.

4. **`Zip` and `Cross` node specs.** Need to define them: `Zip` waits for
   matching index across two iteration sources (errors if cardinalities
   differ); `Cross` emits cartesian product (every (a, b) pair). Both mint
   fresh `iteration` lineage so downstream treats them as a new root.
