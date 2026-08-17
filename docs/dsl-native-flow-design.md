# DSL Native Flow — Technical Design

**Status:** Draft — for review
**Last updated:** 2026-08-17

---

## 1. Summary

A third way to run nodes, cheaper than both existing ones: call a node as a
typed async function and write the control flow in plain JavaScript. No graph,
no edges, no `WorkflowRunner`, no QuickJS. `await` is the edge, a variable is
the wire, `Promise.all` is the fan-out.

```ts
import { startFlow, text, gemini } from "@nodetool-ai/dsl/flow";

await using flow = await startFlow({ secretResolver });

await flow.run(async () => {
  const draft = await text.template({
    string: "Write a haiku about {{topic}}",
    values: { topic: "rain" }
  });
  const speech = await gemini.audio.textToSpeech({ text: draft.output });
  return speech.output;
});
```

Each call resolves the node class from the registry, assigns the inputs,
injects secrets, runs `process()`/`genProcess()` through the node's own
`toExecutor()` bridge, and returns the outputs record — the same execution the
kernel's `NodeActor` performs, minus the actor.

The existing graph DSL (`workflow()` + `run()`) and the QuickJS sandbox are
untouched. This is the host-side surface for **trusted** code: CLI scripts,
server code, tests, harnesses, and agent-authored flows that already run on
the host.

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

1. Extract `buildBuiltinRegistry()` from `core.ts` `run()`; no behavior
   change. Extend it with the executor-resolution chain both paths share.
2. `flow/core.ts`: `startFlow`, ambient ALS, invoke path, one-shot +
   drain-to-last semantics, spans, `onCall`, `close()`/asyncDispose.
   Unit tests against hermetic nodes (`nodetool.text.*`, `nodetool.math.*`).
3. Streaming: `.stream` for streaming-output nodes; the `StreamingInputs`
   adapter for `run`-contract nodes, with EOS and early-return tests.
4. Codegen: emit the flow tree; wire `codegen:check`.
5. Python bridge lazy-connect; integration test behind the existing worker
   guard.
6. Docs: README section in `packages/dsl`, a harness-registry entry naming
   the unit suites as the selfcheck.

## 8. Out of scope

- Running untrusted code. The QuickJS sandbox remains the only surface for
  user- or model-authored code the host has not reviewed.
- Trigger nodes and resident flows.
- A migration of existing graph workflows. `workflows export-dsl` keeps
  emitting the graph DSL; a flow-emitting exporter is possible later but is
  not part of this design.
