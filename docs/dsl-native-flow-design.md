# DSL Native Flow — Technical Design

**Status:** In progress — the public surface runs in the QuickJS guest (§0)
**Last updated:** 2026-08-17 — recorded the guest pivot (§0) and rewrote §1

---

## 0. The QuickJS pivot

**What changed:** the public surface is guest code, not a host import. §4–§6
describe the host API, which is now internal.

A user writes flow code in a Code node, where it runs in the sandbox like every
other body. The typed callables live in a shipped pack,
`@nodetool-ai/sandbox-flow` (`packages/sandbox-packs/sandbox-flow/`), built from
`packages/dsl/src/flow/generated/` — one guest module per namespace, emitted by
the same `npm run codegen` pass as the graph tree. Each call crosses to the host
through the capability module `@nodetool-ai/sandbox-nodetool/flow`
(`invoke_node`, `open_node_stream`, `take_node_stream`, `close_node_stream`),
which lands on the host flow of §4–§6.

Point by point against what came before:

- **No `@nodetool-ai/dsl/flow` export.** `startFlow`, `invoke`, `invokeStream`
  and the streaming adapters stay in `packages/dsl/src/flow/`, consumed by the
  capability module. They are the backend, not the API; a caller who wants them
  is inside NodeTool.
- **Streaming input is arrays only, v1.** §4.4's `AsyncIterable` on an input
  handle does not cross the guest boundary, so a `run`-contract node's inputs
  widen to `T | T[]` and nothing more. The host adapter still accepts an
  iterable — nothing in the guest can hand it one.
- **Correlation and `emitGroup` are unchanged** (§5): a group flattens to its
  member emissions, lineage is not modelled, and a `.stream` on a
  `run`-contract node yields `{slot, value}`.
- **Isolation comes back.** §2 counted the sandbox boundary as a cost the host
  surface avoids. It is now paid per call — one crossing for a one-shot call,
  one per item for a stream — and what it buys is that model-authored flow code
  is no longer trusted code.

**Open item.** Pack discovery refuses a non-relative import in authored pack
code (`inspectJavaScript`, `packages/node-sdk/src/sandbox-pack-discovery.ts`),
so the pack's guest core cannot yet name the capability module. Either that
rule gains an allowance for `@nodetool-ai/sandbox-nodetool/*`, or the bridge
ships as a host module (`SANDBOX_HOST_MODULES`). A second, smaller one: the
host mounts a capability facade by scanning the **body's** static imports
(`packages/agents/src/codeact/capability-modules.ts`), so a body using the pack
must also `import "@nodetool-ai/sandbox-nodetool/flow"` itself. Mounting what a
resolved pack module imports would remove that line from every program.

## 1. Summary

A third way to run nodes, cheaper than the graph: call a node as a typed async
function and write the control flow in plain JavaScript. No graph, no edges, no
`WorkflowRunner`. `await` is the edge, a variable is the wire, `Promise.all` is
the fan-out.

```js
// A Code node body. `packages` declares "@nodetool-ai/sandbox-flow".
import "@nodetool-ai/sandbox-nodetool/flow";
import { template } from "@nodetool-ai/sandbox-flow/nodetool.text";
import { textToSpeech } from "@nodetool-ai/sandbox-flow/gemini.audio";

const draft = await template({
  string: "Write a haiku about {{topic}}",
  values: { topic: "rain" }
});
const speech = await textToSpeech({ text: draft.output });
return speech.output;
```

Each call resolves the node class from the registry, assigns the inputs,
injects secrets, runs `process()`/`genProcess()` through the node's own
`toExecutor()` bridge, and returns the outputs record — the same execution the
kernel's `NodeActor` performs, minus the actor.

The existing graph DSL (`workflow()` + `run()`) is untouched, and the sandbox
gains a pack rather than a mode. Where a graph is the deliverable — something
to open in the editor, validate, supervise, or hand to the server — build one
with `@nodetool-ai/sandbox-dsl` instead (§5).

## 2. Why

Three execution paths exist today, and each pays for something a plain script
does not need:

- **`WorkflowRunner` (kernel).** Actor per node, message-passing mailboxes,
  correlation lineage, EOS propagation, `ProcessingMessage` fan-out. Right for
  the editor and for supervised runs; overhead and indirection when the caller
  is code that just wants values.
- **QuickJS sandbox (Code node, CodeAct).** Every value crosses a
  host↔guest marshalling boundary, the guest has its own module loader and
  interrupt budget, and host packs bridge one call at a time. The isolation is
  the point — and the cost. For code we already trust, it buys nothing.
- **Graph DSL `run()`.** Typed authoring, but the built graph still executes
  on `WorkflowRunner`, so branching, loops, and retries must be expressed as
  nodes (`If`, `ForEach`, …) instead of `if`, `for`, `try`.

The native flow keeps the DSL's typed node surface — the generated factories'
`Inputs`/`Outputs` types, checked at compile time — and swaps the execution
substrate for direct async calls.

## 3. Design goals

1. **A node call is one function call.** No graph build, no scheduler, no
   serialization. The only machinery per call: registry resolve, secret
   injection, `process()`.
2. **JavaScript is the control plane.** Branches, loops, retries, timeouts,
   concurrency — all plain JS. The API ships no control-flow combinators.
3. **Same types, same nodes, one codegen.** The flow surface is generated
   from the same registry metadata as the graph factories, in the same
   `npm run codegen` pass, gated by the same `codegen:check`.
4. **Same observability.** Each call opens a `node.process` OTel span; LLM
   calls inside it still emit `llm.chat`/`llm.stream` spans and cost-ledger
   rows, because providers go through the same `ProcessingContext`.
5. **Nothing new in the kernel or node-sdk.** The flow layer is a consumer of
   `NodeRegistry`, `toExecutor()`, and `ProcessingContext` as they exist.

## 4. The API

### 4.1 `startFlow` and the `Flow` handle

```ts
import { startFlow, type Flow, type FlowOptions } from "@nodetool-ai/dsl/flow";

const flow: Flow = await startFlow({
  userId: "1",                    // default "1", matching the CLI
  secretResolver,                 // (key, userId) => value — same SecretResolver as RunOptions
  registry,                       // optional NodeRegistry override
  bridgeOptions,                  // Python worker bridge config (lazy, see 4.6)
  signal,                         // AbortSignal — cancels in-flight calls
  onCall                         // (event: FlowCallEvent) => void, see 4.7
});
```

A `Flow` owns what `RunOptions` configures today: one `ProcessingContext`
(job id, user, secrets, storage), the resolved registry chain (caller override
→ `NodeRegistry.global` → the lazily registered builtin packs, exactly as
`run()` in `core.ts` builds it), and at most one Python bridge.

Lifecycle:

```ts
interface Flow {
  run<T>(body: () => Promise<T>): Promise<T>;   // sets the ambient flow (ALS) for body
  readonly context: ProcessingContext;           // escape hatch for advanced callers
  close(): Promise<void>;                        // closes the Python bridge, ends spans
  [Symbol.asyncDispose](): Promise<void>;        // `await using flow = ...`
}
```

### 4.2 Node calls

For every registered node, codegen emits a callable in the flow namespace,
sharing the graph DSL's generated `Inputs`/`Outputs` types with
`Connectable<T>` collapsed to `T` — a value is a value, there are no handles:

```ts
// generated — flow/gemini.audio.ts
export function textToSpeech(
  inputs: TextToSpeechInputs,          // { text?: string; model?: ...; voice_name?: ... }
  opts?: CallOptions                    // { flow?: Flow; signal?: AbortSignal }
): Promise<TextToSpeechOutputs>;       // { output: AudioRef }
```

Resolution of the executing flow, in order: `opts.flow` → the ambient flow set
by an enclosing `flow.run()` (AsyncLocalStorage) → a process-default flow
created lazily on first use (env-var secrets only, no Python bridge). The
default flow makes a five-line script work with zero ceremony; `flow.run()`
is for anything that needs configured secrets, cancellation, or isolation
between concurrent flows.

Under the hood a call is:

```
registry.resolve({id, type, properties: inputs})   // fresh instance per call
  → executor.initialize()
  → executor.process(inputs, flow.context)          // secrets injected by toExecutor()
  → executor.finalize()
```

One-shot nodes return the record `process()` resolves to. A node whose
`genProcess` yields multiple records is drained and the call returns the
**last value per slot** — the same fold `run()` applies to terminal outputs
today. Callers who want the stream use `.stream()`.

### 4.3 Streaming output

Every generated callable for a streaming-output node also carries a `.stream`
member:

```ts
for await (const chunk of agents.agent.stream({ objective, model })) {
  // chunk: Partial<AgentOutputs> — one genProcess yield
  process.stdout.write(chunk.chunk ?? "");
}
```

`.stream(inputs, opts?)` returns `AsyncIterable<Partial<Outputs>>`, one item
per `genProcess` yield. Early `break`/`return` on the iterator calls the
generator's `return()` so the node can clean up. Non-streaming nodes get no
`.stream` member — the type surface tells you which is which.

### 4.4 Streaming input

Nodes with the `run(inputs, outputs, context)` contract consume live streams.
In the flow API their generated inputs accept `AsyncIterable<T>` (or an
array, wrapped for convenience) on stream-typed handles, and the call returns
an async iterable of emissions:

```ts
const events = code.code.stream(
  { code: body, items: readLines(file) },      // items: AsyncIterable<string>
);
for await (const { slot, value } of events) { ... }
```

The adapter bridges the caller's iterables into a `StreamingInputs`
implementation (per-handle queues, EOS on iterable end) and surfaces
`outputs.emit(slot, value)` as `{ slot, value }` items. `emitGroup` flattens
to its member emissions — correlation tokens are a runner concept and do not
cross this boundary (see §5).

The awaited form (`await code.code({...})`) is also defined for these nodes:
drain everything, return last value per slot.

### 4.5 Errors, cancellation, control flow

A node that throws rejects the call with the original error. There is no
verdict machinery, no `--supervise`, no per-node error message stream — the
caller's `try`/`catch` is the supervisor. Retry, fallback, timeout, and
concurrency limits are the caller's JS (`Promise.all`, `AbortSignal.timeout`,
`p-limit`-style helpers); the API deliberately ships none, because shipping
them would be rebuilding the runner one combinator at a time.

`FlowOptions.signal` aborts the flow: in-flight calls reject with
`AbortError`, and the signal is forwarded into `ProcessingContext` so
providers that honor abort stop mid-request. Per-call `CallOptions.signal`
scopes cancellation to one call.

### 4.6 Python nodes

Same policy as `run()` in `core.ts`: a node type no TS registry resolves is a
Python candidate. The flow connects the bridge lazily on the **first** such
call (via `connectPythonBridgeForGraph`'s single-node equivalent), reuses it
for the rest of the flow, and closes it in `close()`. `bridgeOptions` and the
`NODETOOL_WORKER_URL` env behave exactly as documented for `RunOptions`.

### 4.7 Observability

- Each call runs inside a `node.process` span carrying `node.type`, duration,
  and status — the same span name the kernel emits, so a trace of a native
  flow and a trace of a runner execution read with the same analyzer.
- `FlowOptions.onCall` receives `{ type, phase: "start" | "end" | "error",
  durationMs, error? }` for callers who want progress without OTel.
- Cost rows land in the prediction ledger unchanged: providers bill through
  `ProcessingContext`, which the flow supplies.

## 5. What the runner provides that this does not

Stated, not hidden. Choosing the flow API means choosing away:

| Runner feature | Native flow answer |
|---|---|
| `node_update` / job messages, editor progress UI | `onCall` hook + OTel spans; no job row, no editor surface |
| Correlation lineage, `emitGroup` atomic frames, zip semantics | Gone. Grouping is the caller's data structure |
| Supervision (`--supervise`, escalations, verdicts) | `try`/`catch` |
| Per-item fan-out via streaming edges | `Promise.all(items.map(...))` |
| Trigger nodes (webhook/tick/file-watch entry points) | Out of scope — they need a resident run loop |
| Graph-level static validation (`nodetool validate`) | The type checker. Inputs are compile-time checked; there is no graph to validate |
| Persistable/sharable artifact (workflow JSON, editor round-trip) | None. A flow is code. When shareability matters, use the graph DSL |

That last row is the real boundary: **if the artifact must open in the
editor, be validated, supervised, or run by the server, build a graph.** The
flow API is for programs.

## 6. Codegen and package layout

- `packages/dsl/src/flow/core.ts` — `startFlow`, `Flow`, ALS ambient context,
  the invoke path (resolve → secrets → process), the streaming-input adapter,
  the default-flow singleton. Reuses the builtin-pack registration list
  currently inlined in `core.ts` `run()` by extracting it to a shared
  `buildBuiltinRegistry()` (one list, two consumers).
- `packages/dsl/src/flow/generated/` — one module per namespace, emitted by
  the same `npm run codegen` script from the same registry metadata. Each
  node emits: the plain-value `Inputs` type (Connectable stripped), the
  callable, and `.stream` when `is_streaming_output` or the `run` contract is
  present. `codegen:check` covers both trees, so a renamed node cannot leave
  a flow callable behind.
- Package export: `@nodetool-ai/dsl/flow`. The root export stays the graph
  DSL; the two surfaces share `types.ts` (refs, model types) and the
  generated literal types.
- The Code node keeps its `usesStreamInputContract` probe on the body, applied
  at call time instead of graph-build time.

## 7. Implementation plan

Eight tasks, ordered by dependency. T1–T3 are the core and land together or
in sequence; T4 unlocks the typed surface; T5–T8 are independent once T4 is
in. Every task ends with `npm run test --workspace=packages/dsl` green plus
the repo gate (`npm run typecheck && npm run lint`), and any task touching
`packages/dsl` re-runs `npm run codegen:check`.

### T1 — Extract the shared registry/executor chain

*Refactor only; no behavior change.*

- **Files:** `packages/dsl/src/core.ts` → new `packages/dsl/src/registry.ts`.
- **Steps:**
  1. Move the builtin-pack registration block from `run()` (the
     `registerBaseNodes` + five try/catch optional packs, `core.ts:340–377`)
     into `buildBuiltinRegistry(): Promise<NodeRegistry>`, memoized per
     process — `run()` currently rebuilds it per call, which the flow API
     must not do per node call.
  2. Move the resolution chain (`opts.registry` → `NodeRegistry.global` →
     builtin → Python candidate) into
     `createExecutorResolver(opts, bridge): (node) => NodeExecutor`.
  3. Re-wire `run()` through both helpers.
- **Acceptance:** `tests/core.test.ts` and `tests/integration.test.ts` pass
  unchanged; `registry.ts` exports are consumed by `core.ts` only (until T2).

### T2 — Flow core: `startFlow`, ambient context, invoke path

- **Files:** new `packages/dsl/src/flow/core.ts`,
  `packages/dsl/src/flow/invoke.ts`; new test
  `packages/dsl/tests/flow-core.test.ts`.
- **Steps:**
  1. `Flow` / `FlowOptions` / `CallOptions` types as in §4.1–4.2. `Flow`
     owns one `ProcessingContext` (job id `flow-<uuid>`, `userId` default
     `"1"`, `secretResolver`, `FileStorageAdapter` on the default assets
     path — same wiring as `run-node.ts`).
  2. Ambient context: module-level
     `AsyncLocalStorage<Flow>`; `flow.run(body)` = `als.run(flow, body)`.
  3. Flow resolution helper `resolveFlow(opts?: CallOptions): Flow` —
     `opts.flow` → `als.getStore()` → lazy process-default flow (env
     secrets only, created once, never auto-closed).
  4. `invoke(nodeType, inputs, opts)` in `invoke.ts`: resolve executor via
     T1's chain, fresh instance per call, `initialize()` →
     drain `genProcess(inputs, ctx)` folding last-value-per-slot →
     `finalize()` in a `finally`. Rejects with the node's error unwrapped.
  5. `close()` + `[Symbol.asyncDispose]`: idempotent; closes the Python
     bridge when one was connected (T7); subsequent calls on a closed flow
     reject with `FlowClosedError`.
  6. `onCall` events (`start`/`end`/`error` with `type`, `durationMs`) and a
     `node.process` span per call via the existing tracing entry point the
     kernel uses.
- **Tests (hermetic, no keys):** one-shot call returns outputs
  (`nodetool.text.Concat`); multi-yield `genProcess` folds to last value;
  ambient vs explicit `{flow}` precedence (two concurrent `flow.run` bodies
  don't cross); default-flow fallback works with no `startFlow`; error from
  `process()` rejects and `finalize()` still ran; closed flow rejects;
  `onCall` sequence recorded.
- **Acceptance:** all of the above green; no import of `WorkflowRunner`
  anywhere under `src/flow/`.

### T3 — Streaming both directions

- **Files:** `packages/dsl/src/flow/streaming.ts`; test
  `packages/dsl/tests/flow-streaming.test.ts`.
- **Steps:**
  1. `invokeStream(nodeType, inputs, opts): AsyncIterable<Record<string,
     unknown>>` — yields each `genProcess` record; iterator
     `return()`/`throw()` forwarded to the generator so early `break` runs
     node cleanup; `finalize()` on completion either way.
  2. `StreamingInputs` adapter for `run`-contract nodes: accepts
     `AsyncIterable<T> | T[] | T` per stream-typed handle; per-handle queue
     with EOS on source end; implements `stream`, `any`, `first`, and the
     envelope variants with synthesized plain envelopes.
  3. `StreamingOutputs` adapter: `emit(slot, value)` pushes `{slot, value}`
     into the returned async iterable; `emitGroup` flattens to member
     emissions (correlation tokens dropped — §5).
  4. Awaited form for `run`-contract nodes = drain the emission iterable,
     fold last-value-per-slot.
  5. Backpressure: the emission queue is unbounded is **not** acceptable —
     cap it (default 1024) and make `emit` await the consumer past the cap.
- **Tests:** stream yields in order; early `break` triggers generator
  cleanup (probe with a `finally` in a test node); array input wraps to a
  stream; interleaved two-handle `any()` order; EOS terminates `run()`;
  emission backpressure (producer awaits when the consumer is slow);
  `emitGroup` flattening.

### T4 — Codegen: the typed flow surface

- **Files:** `packages/dsl/scripts/codegen.ts`,
  `packages/dsl/src/flow/generated/` (emitted),
  `packages/dsl/src/flow/index.ts`; extend
  `packages/dsl/tests/codegen.test.ts`.
- **Steps:**
  1. Emit one flow module per namespace next to the graph tree, from the
     same metadata pass. Per node: a plain-value `Inputs` type (today's
     literal types minus the `Connectable<...>` wrapper — emit the inner
     type directly rather than unwrapping with a conditional type, so hover
     types stay readable), the callable
     `(inputs, opts?) => Promise<Outputs>` delegating to T2's `invoke`.
  2. `.stream` member only when `is_streaming_output` (the flag read at
     `codegen.ts:376`) or the class declares the `run` contract; typed
     `AsyncIterable<Partial<Outputs>>`.
  3. Stream-typed input handles on `run`-contract nodes widen to
     `T | T[] | AsyncIterable<T>`.
  4. Code node special case: the callable applies `usesStreamInputContract`
     to `inputs.code` at call time to pick the invoke path.
  5. `--check` covers the flow tree (it already diffs the whole emitted
     set; assert with a deliberate stale file in the test).
  6. Namespace re-exports from `flow/index.ts`; keep the graph DSL's
     namespace names.
- **Acceptance:** `npm run codegen` is idempotent; `codegen:check` fails on
  a hand-edited flow file (prove it once, revert); `tsc` accepts
  `text.template({string: "x"})` and rejects `{string: 1}` in a
  type-level test.

### T5 — Package export and docs

- **Files:** `packages/dsl/package.json`, `packages/dsl/README.md`,
  `AGENTS.md` (this repo file's DSL row), this doc's status line.
- **Steps:** add the `./flow` export map entry (mirroring the root entry's
  four conditions, including `nodetool-dev`); README section with the §1
  example; note in the exports table.
- **Acceptance:** `node -e 'import("@nodetool-ai/dsl/flow")'` resolves from
  a built workspace; `npm run build:packages` clean.

### T6 — Abort and error semantics

- **Files:** `flow/core.ts`, `flow/invoke.ts`; test
  `packages/dsl/tests/flow-abort.test.ts`.
- **Steps:**
  1. `FlowOptions.signal` and `CallOptions.signal` combined per call
     (`AbortSignal.any`); already-aborted signal rejects before resolve.
  2. Forward the combined signal into `ProcessingContext` so providers that
     honor abort stop mid-request; nodes that ignore it still reject at the
     next yield boundary.
  3. Streaming iterables settle their pending `next()` with the abort
     rejection and run generator cleanup.
- **Tests:** pre-aborted call rejects with `AbortError` and never invokes
  `process()`; mid-stream abort cleans up; flow-level abort rejects two
  concurrent in-flight calls.

### T7 — Python bridge lazy-connect

- **Files:** `flow/core.ts` (+ a small helper in
  `packages/runtime` if `connectPythonBridgeForGraph`'s graph-shaped
  signature doesn't fit a single node type — prefer reusing its internals
  via a `connectPythonBridgeForTypes(types, hasTsExecutor, opts)` overload).
- **Steps:** on the first call whose type no TS registry resolves, connect
  once (single in-flight promise so concurrent first calls share it); reuse
  for the flow's lifetime; close in `close()`. `bridgeOptions` /
  `NODETOOL_WORKER_URL` as in §4.6.
- **Tests:** unknown type with no bridge configured rejects with the
  existing "Unknown node type" error; bridge connect is invoked at most
  once under concurrency (fake bridge); integration test behind the
  existing worker-availability guard used by the graph DSL's integration
  suite.

### T8 — Harness registry entry

- **Files:** `packages/cli/src/harness/registry.ts`.
- **Steps:** add a `dsl-native-flow` harness entry covering the
  `packages/dsl` surface, naming the T2/T3/T6 suites as the keyless
  selfcheck so `nodetool harness gate` runs them on diffs touching
  `packages/dsl/src/flow/`.
- **Acceptance:** `nodetool harness audit` passes with no new undocumented
  gap; `harness gate --dry-run` on a flow-touching diff plans the suites.

## 8. Out of scope

- Running untrusted code. The QuickJS sandbox remains the only surface for
  user- or model-authored code the host has not reviewed.
- Trigger nodes and resident flows.
- A migration of existing graph workflows. `workflows export-dsl` keeps
  emitting the graph DSL; a flow-emitting exporter is possible later but is
  not part of this design.
