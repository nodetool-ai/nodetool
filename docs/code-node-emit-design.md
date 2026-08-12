# Code Node Output Interface: `emit` + final result

Status: proposed. Owner: code-nodes / node-sdk. 2026-08-12.

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
   the check is fighting normal code shape.
3. **There is no call an agent can reason about.** CodePlanner, `validate_code`
   and repair loops infer outputs from data shape. A function call —
   `emit(name, value)` — is a fact an AST query answers directly.

## Guest contract

Two additions to the sandbox API, both host-bridged:

```js
await emit(name, value)   // stream one value to output handle `name`, now
return { ...outputs }     // final result, unchanged
```

- **`emit(name, value)`** delivers `{ [name]: value }` downstream immediately,
  while the body keeps running. It is `await`-able; awaiting it applies
  backpressure (see Limits). `name` must be a string matching an output
  handle; `value` goes through the same marshaling as a returned value
  (JSON-safe data, media refs from `media.toImage` etc.).
- **The final result stays `return`.** `return { sum, report }` posts one last
  bag, exactly as today. A body that only emits may `return` nothing — with at
  least one `emit` call in the body, the implicit `return {}` is valid and the
  "output unset on a return path" rule no longer applies to emitted handles.
- **`emit(bag)`** (single object argument) is accepted as sugar for one call
  per key, so a legacy `yield {a, b}` maps 1:1.

Not added: a separate `done(outputs)` function. `return` already is the final
send, it is ordinary JavaScript, and one way to finish is easier to validate
and to teach a model than two.

### Semantics

| Situation | Behavior |
|---|---|
| `emit("out", v)` | `{out: v}` streams downstream in call order, live |
| `return {a: 1}` after emits | final bag `{a: 1}` is the last message |
| `return` nothing, ≥1 `emit` in body | valid; run ends after last emit drains |
| body with neither `emit` nor `return` value | implicit-return of last expression, unchanged |
| `emit` to a name that is not a declared output | validation error before run; at runtime the call throws |
| non-serializable value | same marshal rules as return (JSON deep-copy; media via `media.to*`) |
| error thrown after emits | already-emitted values were delivered; the node fails; downstream consumers see the stream end in error, per normal kernel semantics |
| timeout mid-stream | same as error: delivered emits stand, node fails |

## Host mechanics

`emit` joins `EXPOSED_BRIDGE_NAMES` in `packages/agents/src/js-sandbox.ts` as
an **awaitable** host call (the `__callTool`/asyncified path, not the
fire-and-forget `progress` path — values cannot be rate-limited or dropped).

`CodeNode.genProcess` becomes a pump instead of a replay:

```
start runInSandbox(...)          → promise P
while P pending or queue non-empty:
    yield next bag from queue    (each emit pushed one)
await P
yield normalizeCodeOutput(P.result)   (unless empty)
```

The queue is a bounded async channel owned by the node invocation. The host
side of `emit` resolves the guest's promise only after its bag is accepted by
the channel, so a fast producer awaiting `emit` blocks until the kernel has
consumed — backpressure with no new kernel concept. A body that calls `emit`
without `await` still works; the channel bound (below) caps unacknowledged
values.

Routing between `process` and `genProcess` follows a static probe,
`hasEmitCall(code)` next to `hasReturnStatement` in `code-body.ts` — an AST
check, not a regex, since `emit` is an ordinary call expression. Bodies with
neither `emit` nor `yield` keep the single-shot `process` path.

### Limits

- Channel capacity: 64 pending bags. `emit` awaits drain beyond that.
- Max emits per run: 10 000 (same spirit as `MAX_PROGRESS_CALLS`; exceeding
  throws in the guest, naming the cap).
- Per-value size: bounded by the existing sandbox marshal limits; no new cap.

## Validation and analysis

`code-analysis.ts` / `code-node-validation.ts` (shared by the validator, the
`submit_code` planner, and the editor) learn one fact: an `emit("x", …)` call
marks output `x` as **streamed**.

- A declared output must be either streamed (≥1 reachable `emit` with that
  literal name) or set on every return path — the current rule, per handle.
- `emit` with a non-literal first argument downgrades that body to a warning
  ("cannot check emitted names statically") instead of failing it.
- `emit` to a name not in the node's declared dynamic outputs is an error,
  symmetric with the existing undeclared-`inputs.<name>` read check.
- `emit` counts as a known global; a bare `emit` read stops being a
  ReferenceError candidate.

## Surface parity

- **`run_code` / `test_code`** (`packages/agents/src/capabilities/code.ts`):
  emitted values land in the existing `streamed` array as `{name, value}`
  entries, in order; `test_code` cases may assert on `streamed` as well as
  final outputs.
- **CodePlanner / code-gen eval**: prompt and cases updated to prefer `emit`
  for incremental output; the `code-gen` suite gains one streaming case.
- **Editor**: the Code node description and the assistant dialog prompt teach
  `emit`; no UI change — streamed values render through the same
  `node_update`/output messages every streaming node already produces.
- **Docs**: `docs/javascript-sandbox.md` § Streaming rewritten around `emit`.

## Backwards compatibility and migration

- `return {}` bodies: unchanged, byte for byte.
- `yield` bodies: keep working for one release. The legacy path is re-expressed
  on top of the new one — the rewrite becomes `yield x` → `await emit(x)`
  (bag form), which turns collect-and-replay into live streaming for free.
  `validate_code` emits a deprecation warning naming `emit`.
- After the deprecation window the `yield` rewrite and `hasYieldStatement`
  routing are deleted; `yield` in a body becomes what it is in JavaScript — a
  syntax error at top level.

## Testing

- Unit (`packages/code-nodes`): emit ordering, emit+return interleave,
  backpressure (producer faster than consumer), cap exceeded, error after
  emit, `emit` to undeclared handle throws, legacy `yield` maps to live emits.
- Analysis (`packages/node-sdk`): streamed-output satisfies the declared-output
  rule; non-literal name warns; undeclared name errors. Each new check is
  proven failable with an inverted fixture before landing.
- Harness: a `test_code` case asserting `streamed` contents; one `code-gen`
  eval case whose expectation requires incremental emission.
- End-to-end: a workflow where a Code node emits into a downstream collector
  runs under `nodetool debug` and shows per-item messages arriving before the
  node completes.

## Out of scope

- CodeAct (`execute_code`) — its scripts act on the toolbelt and return one
  result; streaming there is a separate question.
- New kernel message types — emits ride the existing `genProcess` bag
  semantics.
- Per-output typing of emitted values beyond the handle's declared type.
