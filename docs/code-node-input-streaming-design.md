# Code Node Input Streaming: `stream`

Status: implemented, 2026-08-12. Owner: code-nodes / node-sdk / kernel.
Companion: [code-node-emit-design.md](code-node-emit-design.md) — the output
side of the same contract, already implemented.

## Problem

A Code node consumes its inputs buffered: the kernel invokes the body once per
upstream item, with `inputs` holding that invocation's snapshot. Streaming
*out* of a body is solved (`emit`), but streaming *in* is not — the body never
sees the stream, only one frame of it. That shape has four costs:

1. **Cross-item logic needs the `state` escape hatch.** A running total, a
   window, a dedupe set — anything spanning items lives in the mutable `state`
   object that survives invocations. The logic of one loop is split across N
   invocations of a body that reads like a single step, and the author must
   reason about which variables reset and which persist.
2. **End-of-stream is invisible.** A body cannot say "when the stream ends,
   emit the summary". The workarounds are a downstream Collect node plus a
   second Code node, or nothing.
3. **Two streams cannot be merged by arrival.** Each invocation is one
   correlated frame. Interleaving two upstream streams as they arrive —
   a chat stream plus a control stream, audio chunks plus parameter changes —
   is not expressible in a body at all.
4. **The kernel mode exists; the Code node cannot reach it.** Streaming-input
   execution is shipped machinery: `is_streaming_input` nodes implement
   `run(inputs, outputs)` and drain their inbox via `NodeInputs.stream()` /
   `.any()` (`packages/kernel/src/io.ts`, actor path in
   `packages/kernel/src/actor.ts`). Collect, the audio synth chain, and
   FrameToVideo all run this way. The Code node cannot, because the flag is
   resolved per node *type*: `hydrateGraphNodeFlags` and
   `Graph.loadFromDict` let the class static (`cls.isStreamingInput`,
   `false` for CodeNode) override anything saved on the node, deliberately, so
   stale saved flags cannot survive a type migration. Whether a Code node
   streams is a property of its *body*, and no per-type flag can carry that.

## Guest contract

One new global, `stream`, mirroring the kernel's `NodeInputs` verbs. It is the
input-side twin of `emit`/`output`: explicit calls, statically visible names,
nothing inferred from data shape.

```js
for await (const item of stream(name))        // items for handle `name`, until EOS
for await (const [handle, item] of stream.any())  // all handles, arrival order
const item = await stream.first(name)         // next item, or undefined at EOS
stream.open(name)                             // true while upstream can still produce
```

- **`stream(name)`** returns an async iterable over the values arriving on
  input handle `name`, in order, completing at end-of-stream. `name` must be a
  string literal naming a connected input handle (see Validation).
- **`stream.any()`** interleaves every connected handle by arrival, yielding
  `[handle, value]` pairs, completing when all upstreams end.
- **`stream.first(name)`** takes the next value for one handle, `undefined`
  when the stream already ended — for a config value that arrives once.
- **`stream.open(name)`** answers "could more arrive?" without consuming.
- Values are marshaled exactly like buffered inputs today (JSON deep copy,
  media as refs readable via `media.*`).
- Outputs from a streaming body leave through **`emit`/`output` only**. The
  legacy return contract cannot apply — there is one invocation and its return
  value is control flow, per the emit design.
- `inputs.<name>` still exists in a streaming body but carries the node's
  *configured* property values (what is typed on the node), never per-item
  edge data — connected handles are only reachable through `stream`.
  Reading a connected handle via `inputs.<name>` is a validation error naming
  `stream(name)` (see Validation).
- `state` remains defined but is pointless here: one invocation, so plain
  local variables already persist across items.

Examples:

```js
// Running total, live, with a final summary — today: state + Collect + a second node.
let sum = 0;
for await (const n of stream("numbers")) {
  sum += n;
  await emit("running", sum);
}
await output("total", sum);
```

```js
// Merge two streams by arrival — today: not expressible.
for await (const [handle, value] of stream.any()) {
  await emit("merged", { from: handle, value });
}
```

## Mode selection

Automatic from the body, exactly like the emit contract: a textual probe
`usesStreamInputContract(code)` in `packages/node-sdk/src/code-body.ts`,
matching a free call/member of `stream` outside strings and comments — the
sibling of `usesEmitOutputContract` and shaped the same way, textual because it
must answer before the parser, on bodies that may not parse.

- Probe true → the node executes in streaming-input mode (`run()`).
- Probe false → today's buffered per-item invocation, byte-for-byte unchanged.

No checkbox, no new node type. The body is the declaration.

## Flag hydration: per-instance resolution

The kernel actor trusts `node.is_streaming_input` to pick `run()` over
per-item invocation, and both hydration paths currently stamp it per type. The
change is one optional class hook:

```ts
// BaseNode static, node-sdk
static resolveStreamingInput?(node: {
  properties?: Record<string, unknown>;
}): boolean;
```

`CodeNode` implements it as `usesStreamInputContract(String(node.properties?.code))`.
Consulted at both stamp sites:

- **`hydrateGraphNodeFlags`** (`packages/node-sdk/src/registry.ts`):
  `is_streaming_input: (cls ? cls.resolveStreamingInput?.(node) ?? cls.isStreamingInput : meta?.is_streaming_input) ?? node.is_streaming_input ?? false`.
- **`Graph.loadFromDict`** (`packages/kernel/src/graph.ts`): the resolver's
  per-type `descriptorDefaults` cannot carry a per-instance answer, so
  `createGraphNodeTypeResolver`'s resolved shape gains an optional
  `resolveInstanceFlags(node) => { is_streaming_input?: boolean }` closure the
  merge site calls with the raw node; its answer takes the slot
  `descriptorDefaults.is_streaming_input` holds today. Kernel stays
  registry-agnostic — it calls a function it was handed, as it already does
  for type resolution.

Every existing per-type node is untouched: no hook means today's exact
resolution. The saved `node.is_streaming_input` keeps its current role
(applies only when the registry has no opinion), so a stale saved flag still
cannot survive an edit that removes the last `stream` call — the hook re-reads
the body every hydration.

`is_streaming_output` needs nothing: CodeNode overrides `genProcess`, so
`hasStreamingOutput` already answers true.

## Host mechanics

`CodeNode` gains `run(inputs, outputs, context)`, which the actor calls when
the hydrated flag is true. It starts `runInSandbox` once and bridges both
directions:

- **Guest → host (outputs):** unchanged — `onEmit` routes each bag through
  `outputs.emit(name, value)` live; recorded `output` finals post as one bag
  after the run succeeds. The bounded emit channel and its backpressure carry
  over from the `genProcess` pump.
- **Host → guest (inputs):** one new awaitable bridge call,
  `__takeInput(handle | null)`, behind the `stream` prelude. The host keeps
  one `inputs.stream(handle)` generator per handle (created lazily) plus one
  `inputs.any()` generator for `stream.any()`, and answers each call with
  `{done}` or `{value}` (`{handle, value}` for any). Concurrent takes on one
  generator serialize on a promise chain; distinct handles proceed in
  parallel, same as concurrent `fetch` calls today. `stream.open(name)` maps
  to `inputs.hasStream(name) || inputs.hasBuffered(name)`.
- **Backpressure is free.** The guest pulls; an item the body has not asked
  for stays in the kernel inbox, which already buffers for slow consumers.
  No channel, no cap.
- **Timeout must not count waiting.** A streaming body legitimately lives as
  long as its upstream. The sandbox already has the mechanism: a
  `SandboxClock` the host suspends during round-trips it cannot hurry.
  The input bridge suspends the clock while a take is parked on an empty,
  still-open inbox and resumes it when the value (or EOS) arrives — the
  body's compute budget (`timeout`, default 30 s) is spent only on its own
  execution. The suspend allowance for input waits is unbounded: the run's
  own cancellation is the lifetime bound, and a stream that never ends is the
  upstream's bug, surfaced by the runner, not a reason to kill a correct
  consumer.
- **Cancellation:** run cancel aborts the existing sandbox signal; the inbox
  iterators observe `NodeInputs.signal` and end; parked takes resolve as done.
- **Lineage:** `NodeInputs` records the most recently consumed envelope per
  handle, and the actor's existing streaming-input rule gives
  `outputs.emit()` that inherited lineage — the same treatment the unmigrated
  stream filters (Take, Drop, Filter) get today. The guest API stays
  data-only; per-envelope `forward()` semantics are out of scope.

### Semantics

| Situation | Behavior |
|---|---|
| `stream("a")` on a connected handle | yields each arriving value in order, completes at EOS |
| `stream("a")` on an unconnected handle | validation warning; at runtime completes immediately (empty) |
| `stream.any()` | `[handle, value]` pairs by arrival; completes when all upstreams end |
| `stream.first("a")` after EOS | `undefined` |
| two concurrent `stream("a")` iterations | items are distributed, not duplicated (one inbox iterator per handle); validation warns |
| `emit` between takes | delivered downstream immediately, as today |
| body ends with items unread | remaining items are dropped with the invocation, as for any streaming-input node |
| error thrown mid-stream | already-emitted values stand, `output` finals dropped, node fails — same as emit design |
| `timeout` | counts guest execution only; time parked on input is clock-suspended |
| run cancelled while parked | take resolves done, body unwinds, sandbox aborts |
| streaming body under `--supervise` | unchanged: the kernel already stamps `streamingInput` on the escalation context and computes the allowed-verdict set accordingly |

## Validation and analysis

All in `code-analysis.ts` / `code-node-validation.ts` (node-sdk), shared by the
graph validator, `submit_code`, `validate_code`, and the editor:

- `stream` joins `SANDBOX_GLOBALS`; a bare read stops being a
  ReferenceError candidate.
- `stream(<literal>)` / `stream.first(<literal>)` / `stream.open(<literal>)`
  naming a handle the node does not declare is an **error**, symmetric with
  the undeclared-`inputs.<name>` read check. A non-literal argument downgrades
  to a warning ("cannot check stream names statically").
- `stream(name)` on a declared but **unconnected** handle is a warning (it
  runs, but yields nothing) — decidable because `validateCodeNodeBody` runs
  inside `validateGraph` with the edges in hand.
- In a streaming body, `inputs.<name>` where `name` has an incoming edge is an
  **error** naming `stream(name)` — the one footgun the split contract
  creates, closed statically.
- A streaming body on the legacy return/yield contract is an **error**: a body
  that calls `stream` must send outputs through `emit`/`output`. (Probe order:
  `usesStreamInputContract` implies the emit contract is required, whatever
  `usesEmitOutputContract` says.)
- Buffered bodies validate exactly as today.

Each new check lands with an inverted fixture proving it can fail, per the
repo rule.

## Surface parity

- **`run_code` / `test_code`** (`packages/agents/src/capabilities/code.ts`):
  a case gains optional `inputStreams: { [handle]: unknown[] }`; the harness
  feeds them through an in-memory inbox, and streamed outputs land in the
  existing `streamed` array. `validate_code` gains the checks above. A
  streaming body that runs in the harness runs the same way in a workflow —
  the body-shaping rules stay in node-sdk, shared.
- **CodePlanner / `code-gen` eval**: the prompt teaches `stream`; the suite
  gains a windowing case and a merge-by-arrival case.
- **Editor**: the Code node description documents `stream`; the assistant
  dialog prompt teaches it. The editor's streaming badge and edge rendering
  read the hydrated flag; the web bundle computes it with the same
  `usesStreamInputContract` probe (`code-body.ts` is dependency-free and
  already browser-bundled).
- **DSL** (`sandbox-dsl` and `workflows export-dsl`): the `code(...)` helper
  stamps `is_streaming_input` from the probe so `withExplicitNodeFlags`
  graphs run correctly without registry hydration.
- **Docs**: `docs/javascript-sandbox.md` gains § Input streams.

## Limits

- No new caps. Input volume is bounded by upstream producers; take rate is
  bounded by the body's own timeout-metered execution; emit keeps its
  existing channel bound and `MAX_EMIT_CALLS`.

## Backwards compatibility

Purely additive. A body that never mentions `stream` hydrates, validates, and
executes byte-for-byte as today — buffered per-item invocation, `state`,
legacy return contract included. There is no migration, no codemod, and no
deprecation: buffered mode remains the right contract for per-item transforms,
which most Code nodes are. `stream` is for the bodies that today need
`state`, a Collect detour, or are not expressible at all.

## Testing

- Unit (`packages/code-nodes`): ordered delivery per handle; `any()`
  interleave across two handles; EOS completes the loop; `first` after EOS;
  emit-while-parked interleave; unread items dropped at body end; error
  mid-stream drops finals; cancellation unparks; clock suspension (a body
  with a 1 s timeout survives a 5 s input gap, and still dies after 1 s of
  its own compute).
- Hydration (`packages/node-sdk`, `packages/kernel`): a graph node whose
  `code` streams hydrates `is_streaming_input: true` through both
  `hydrateGraphNodeFlags` and `loadFromDict`; editing the `stream` call out
  flips it back; saved stale flags still lose; every hook-less node type
  hydrates exactly as before (pinned against current fixtures).
- Analysis (`packages/node-sdk`): each new rule red on an inverted fixture —
  undeclared stream name, connected-handle `inputs.` read, streaming body on
  the legacy contract, unconnected-handle warning.
- End-to-end: a workflow where a generator streams into a Code node running
  a windowed aggregate into a Preview runs under `nodetool debug` and shows
  per-item `emit` messages arriving while upstream is still producing; the
  same body passes `test_code` with `inputStreams`.

## Deviations from the design as built

- **Finals post through `outputs.emitGroup(finals)`**, not slot-by-slot
  `emit`. One invocation's finals are one frame, so sibling handles share
  minted lineage instead of arriving as N independent items.
- **`run()` called for a body that does not stream throws.** It can only happen
  when a stale saved flag was trusted without hydration, and the path never
  delivers per-item invocations — a buffered body would silently see none of
  its connected inputs, so failing names the misconfiguration instead.
- **`stream.open` reads `hasBuffered` through an optional method.**
  `StreamingInputs` (`packages/runtime/src/node-executor.ts`) gained
  `hasBuffered?(name)`; the kernel's `NodeInputs` already had it, and a
  hand-rolled test double need not.
- **`run_code` / `test_code` name the field `input_streams`** (wire names in
  this surface are snake_case) and define `stream.any()` order as round-robin
  by index across the handles in declaration order — a live inbox is observed,
  pre-staged items have to be ordered by rule.
- **The DSL probe lives in `createNode`** (`packages/dsl/src/core.ts`), gated on
  the Code node's type, rather than in the generated helper: `@nodetool-ai/dsl`
  runs graphs through `withExplicitNodeFlags` with no registry hydration, and
  the generator stamps flags per *type*. Every other surface — the server run
  path, `Graph.loadFromDict`, `ExecutionSession` — hydrates against the
  registry and needs nothing. `sandbox-dsl` likewise needs nothing: its graphs
  reach execution through `create_workflow` / `run_workflow`, which hydrate.

## Out of scope

- **CodeAct** (`execute_code`) — acts on the toolbelt, returns one result;
  no inbox exists there.
- **Per-envelope lineage in the guest** — `forward()`/`drop()` equivalents
  and Zip/Cross-style scope reads stay host-side; the guest sees data.
- **Windowing/batching helpers** (`stream.window(n)`, debounce) — expressible
  in plain JavaScript over `stream()`; sugar can come later without contract
  changes.
- **Python Code nodes** — the worker's execution model is separate; this
  contract is the QuickJS guest's.
