# Code Node Output Interface: `emit` and `output`

Status: implemented (sandbox bridge, CodeNode pump, validation, harness; the
migration codemod remains open). Owner: code-nodes / node-sdk. 2026-08-12.

Two implementation choices differ from the text below, both deliberate: the
legacy deprecation warning lives only in the `validate_code` harness — graph
validation would red the shipped-examples gate (it treats warnings as errors
and every shipped Code body is legacy), and a run-log warning changed the
message stream the Ring 0 reliability goldens pin — and the pristine default
body `return {};` is exempt from the warning, because an empty node is not a
legacy body.

## Problem

The Code node's output contract is a return value: "return an object — its
keys become output handles" (`normalizeCodeOutput` in
`packages/node-sdk/src/code-body.ts`). That shape has three costs, and agents
pay all of them:

1. **Streaming is replay, not streaming.** A body with `yield` runs through
   `genProcess`, but the guest collects every yielded value into an array and
   the host replays them after the run completes
   (`packages/code-nodes/src/nodes/code-node.ts`, the `yield_` rewrite).
   A loop that fetches 50 pages delivers nothing downstream until page 50.
   The rewrite itself is a regex (`code.replace(/\byield\b/g, "yield_")`), so
   the body the node runs is not the body the author wrote, and top-level
   `yield` is not valid JavaScript — real parsers, including our own
   `code-analysis.ts`, must special-case it.
2. **The contract is implicit.** Nothing in the body names an output; the
   shape of every return path does. The validator must prove each declared
   output is set on each return path, and its own error message tells authors
   to avoid branching in code and use `nodetool.control.If` nodes instead —
   the check is fighting normal code shape. On top of the return-path
   analysis sit two more inference layers: implicit-return wrapping of the
   last expression (`wrapImplicitReturn`) and shape normalization of whatever
   came back (`normalizeCodeOutput`).
3. **There is no call an agent can reason about.** CodePlanner, `validate_code`
   and repair loops infer outputs from data shape. A function call —
   `emit("x", value)` — is a fact an AST query answers directly.

## Guest contract

Outputs leave the body only through two host-bridged calls. The body's return
value is **ignored** — `return` is what it is in JavaScript, control flow, and
carries no output semantics.

```js
await emit(name, value)     // stream one value to output handle `name`, now
await output(name, value)   // set the final value of output handle `name`
```

- **`emit(name, value)`** delivers `{ [name]: value }` downstream immediately,
  while the body keeps running. Call it any number of times per handle.
- **`output(name, value)`** records the handle's final value. It is delivered
  when the body completes, all final values as one bag — so a downstream node
  that consumes one value per handle sees exactly one. A second `output` call
  for the same handle throws: a final value that changes is a bug, and a
  deterministic error beats a silent last-write-wins.
- Both are `await`-able; awaiting `emit` applies backpressure (see Limits).
  `name` must be a string naming a declared output handle; values go through
  the same marshaling as today (JSON-safe data, media refs from
  `media.toImage` etc.).
- **`return` does nothing to outputs.** Use it to exit early. A body may end
  without calling either function only when the node declares no outputs.

The symmetry is the point: one verb for "here is an item" and one for "here is
the answer", both explicit, both statically visible, nothing inferred from
data shape.

Deleted with the return contract: `hasReturnStatement` routing,
`wrapImplicitReturn` (implicit return of the last expression), and
`normalizeCodeOutput` (shape normalization). A body that today reads
`inputs.a + inputs.b` becomes `await output("output", inputs.a + inputs.b)` —
one line longer, zero inference.

### Semantics

| Situation | Behavior |
|---|---|
| `emit("out", v)` | `{out: v}` streams downstream in call order, live |
| `output("sum", v)` then body ends | final bag `{sum: v}` is the last message |
| several `output` calls, distinct handles | one final bag carrying all of them |
| `output` twice on one handle | throws in the guest |
| `return v` with any value | `v` is discarded; control flow only |
| body ends, declared output neither emitted nor output | validation error before run (see below); at runtime the handle stays empty |
| `emit`/`output` to an undeclared name | validation error before run; at runtime the call throws |
| non-serializable value | same marshal rules as today (JSON deep-copy; media via `media.to*`) |
| error thrown after emits | already-emitted values were delivered; recorded `output` values are **not** posted; the node fails |
| timeout mid-stream | same as error: delivered emits stand, finals dropped, node fails |

## Host mechanics

`emit` and `output` join `EXPOSED_BRIDGE_NAMES` in
`packages/agents/src/js-sandbox.ts` as **awaitable** host calls (the
asyncified path, not the fire-and-forget `progress` path — values cannot be
rate-limited or dropped).

`process()` disappears from `CodeNode`; every body runs through one
`genProcess` pump:

```
start runInSandbox(...)            → promise P
while P pending or queue non-empty:
    yield next bag from queue      (each emit pushed one)
await P                            (failure → throw, finals discarded)
yield the collected output() bag   (unless empty)
```

The queue is a bounded async channel owned by the node invocation. The host
side of `emit` resolves the guest's promise only after its bag is accepted by
the channel, so a fast producer awaiting `emit` blocks until the kernel has
consumed — backpressure with no new kernel concept. `output` never queues; the
host stores the value and posts the bag after `P` resolves. A body that calls
`emit` without `await` still works; the channel bound (below) caps
unacknowledged values.

### Limits

- Channel capacity: 64 pending bags. `emit` awaits drain beyond that.
- Max emits per run: 10 000 (same spirit as `MAX_PROGRESS_CALLS`; exceeding
  throws in the guest, naming the cap).
- Per-value size: bounded by the existing sandbox marshal limits; no new cap.

## Validation and analysis

The return-path analysis in `code-node-validation.ts` — "every declared output
set on every return path" — is deleted, not amended. Its replacement is one
reachability rule over two call names:

- Every declared output must have ≥1 reachable `emit` or `output` call with
  that literal name. Branching freely is fine; the rule is per-handle
  existence, not per-path coverage.
- A call with a non-literal first argument downgrades that body to a warning
  ("cannot check output names statically") instead of failing it.
- A call naming an undeclared handle is an error, symmetric with the existing
  undeclared-`inputs.<name>` read check.
- `emit` and `output` count as known globals; a bare read of either stops
  being a ReferenceError candidate.
- A top-level `return <value>` (non-`undefined` argument) is a warning naming
  the new contract, since under the old one it meant "these are the outputs".

The analysis lives where it does today (`code-analysis.ts` /
`code-node-validation.ts` in node-sdk), shared by the graph validator, the
`submit_code` planner, and the editor.

## Surface parity

- **`run_code` / `test_code`** (`packages/agents/src/capabilities/code.ts`):
  emitted values land in the existing `streamed` array as `{name, value}`
  entries, in order; final values land in `outputs`. `test_code` cases may
  assert on both.
- **CodePlanner / code-gen eval**: prompts and cases rewritten to the
  emit/output contract; the `code-gen` suite gains one streaming case.
- **Editor**: the Code node description and the assistant dialog prompt teach
  the two calls; no UI change — streamed values render through the same
  messages every streaming node already produces.
- **Docs**: `docs/javascript-sandbox.md` § Outputs and § Streaming rewritten.

## Backwards compatibility and migration

Removing the return contract breaks every existing body, so the old path
stays executable for one release behind a per-body probe:

- A body that calls `emit` or `output` runs on the new contract; its return
  value is ignored.
- A body that calls neither runs on the legacy path (return bag, implicit
  return, `yield` replay), and `validate_code` emits a deprecation warning
  naming the two calls. Saving such a node in the editor surfaces the same
  warning.
- The workflow migration is mechanical and shippable as a codemod on the
  stored `code` string: `return {a, b}` → `await output("a", a); await
  output("b", b); return;`, `yield x` → `await emit("output", x)`. The codemod
  runs through `validate_code` on its own result and refuses any body it
  cannot prove equivalent, leaving those for hand migration.
- After the window, `hasReturnStatement`, `hasYieldStatement`,
  `wrapImplicitReturn`, `normalizeCodeOutput`, the `yield_` rewrite, and the
  return-path validator all delete.

## Testing

- Unit (`packages/code-nodes`): emit ordering; emit+output interleave; finals
  post as one bag; double `output` throws; `return` value discarded;
  backpressure (producer faster than consumer); cap exceeded; error after
  emit drops finals; undeclared handle throws; legacy body still runs and
  warns.
- Analysis (`packages/node-sdk`): reachable-call rule satisfies declared
  outputs; non-literal name warns; undeclared name errors; top-level valued
  `return` warns. Each new check is proven failable with an inverted fixture
  before landing.
- Codemod: round-trips the shipped example workflows' Code bodies and the
  code-gen eval fixtures; every migrated body passes `validate_code` and
  `test_code` with unchanged expectations.
- End-to-end: a workflow where a Code node emits into a downstream collector
  runs under `nodetool debug` and shows per-item messages arriving before the
  node completes.

## Out of scope

- CodeAct (`execute_code`) — its scripts act on the toolbelt and return one
  result; this contract is for *node* code.
- New kernel message types — emits and the final bag ride the existing
  `genProcess` semantics.
- Per-output typing of emitted values beyond the handle's declared type.
