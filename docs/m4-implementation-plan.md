# M4 implementation plan — WASM execution (scalar-only)

Task breakdown for milestone M4 of
[sandbox-package-design.md](sandbox-package-design.md): declared WASM
modules become callable from guest code through generated facades, on
workers, instance per call, under layered budgets.

Grounding: the static half already shipped in M0.
`validateWasmModule`/`parseWasm` in
`packages/node-sdk/src/sandbox-pack-discovery.ts` enforce the whole
binary contract — magic/version, zero imports, every memory unshared
with a maximum at or below both the manifest's `memoryPagesMax` and the
4096-page host ceiling, declared exports present and function-kind,
arity ≤ 8, ≤ 1 result, `i32`/`f32`/`f64` value types only — and the
resolution schema carries WASM `bytes` through the catalog. What does
not exist is everything at run time: the M1 loader rejects `kind:
"wasm"` resolutions with an M4 error.

## Task 1 — Validation gaps and manifest mapping

Close the deltas between the shipped validator and the design text:

- Export-name identifier rule: a manifest export must be a valid,
  non-reserved JS identifier, and a binary export that is not
  (`"foo-bar"`) must use the explicit `{ "wasm": "foo-bar", "as":
  "fooBar" }` mapping (the schema already allows the object form —
  validate the `as` name).
- Skip reasons name the offending export and rule ("uses i64", "is a
  memory, not a function") rather than the generic unsupported-
  signature message, per "named in the skip reason, not silently
  dropped".
- Per-call timeout and budget fields a manifest may **lower** (never
  raise): schema additions with the defaults as ceilings.

## Task 2 — The WASM host: workers, pool, instance per call

New module in `packages/agents` (beside `js-sandbox.ts`, which owns the
guest side and already runs on Node and browser):

- Compile once per process from the resolution's bytes;
  `WebAssembly.Module` is structured-cloneable, so the compiled module
  crosses to workers without recompiling.
- Calls run on workers — Node `worker_threads`, browser Web Worker —
  from a process-wide pool of 4. A hard per-call timeout (5 s default)
  terminates **and replaces** the worker.
- **Instance per call, stateless**: each call instantiates fresh from
  the cached module inside the worker, runs, discards. Mutable globals
  and linear memory do not survive between calls; the docs say so.
  This is what makes terminate-and-replace coherent — a killed worker
  destroys nothing an invocation owns.
- Argument conversion is validated host-side before dispatch, never
  left to WebAssembly coercion: `i32` requires a finite integer in
  int32 range (out-of-range rejects, no wrapping); `f32`/`f64` accept
  any JS number including `NaN` and infinities, `f32` rounding by
  WebAssembly's rules. Return values mirror the same rules; a void
  export resolves `undefined`.

## Task 3 — Budgets

Layered, defaults fixed by the design, a manifest may lower:

| Bound | Default |
|---|---|
| Process-wide worker pool | 4 |
| Per-invocation call concurrency | 2 |
| Calls per invocation | 256 |
| Aggregate WASM wall clock per invocation | 30 s |
| Per-call timeout | 5 s |

Exhaustion errors name the budget and the module. No byte caps — those
belong to the future byte ABI.

## Task 4 — Generated facades and the per-run dispatcher

- For a WASM entry, the catalog resolution carries a generated ESM
  facade: named async exports matching the manifest's `exports`, each
  calling a per-run dispatcher. Authored JS in the same pack importing
  a sibling WASM specifier resolves to the same facade. The facade
  source and generator version join the module-graph digest (the
  digest schema already anticipates this).
- The dispatcher is the boundary, not the hiding: it serves only WASM
  modules declared for the run, validates module identity, export
  allowlist, and argument count/types on every call. The static
  analyzer and the M1 loader both deny direct imports of the private
  bridge module, and the dispatcher binding is removed before the user
  IIFE starts — but a module that finds the binding anyway gains
  nothing beyond the run's declared WASM surface.
- The M1 loader's "WASM is M4" rejection is replaced by facade
  mounting.

## Task 5 — Reference module and toolchain doc

One scalar reference module built from a documented toolchain (Rust
`no_std` → `wasm32-unknown-unknown`, or WAT via wabt — whichever the
doc pins), checked in as bytes with its source and build instructions.
It is the fixture for every execution test and the template third
parties copy. The byte-oriented reference module from M-1 informs the
future byte ABI and ships as documentation only.

## Task 6 — Contract tests, Node and browser

- Happy path: facade import, scalar round trips for all three types,
  void export, `as`-mapped name.
- Conversion rejections: `i64`-shaped values, out-of-range `i32`,
  non-numbers.
- Statelessness: a mutable-global counter reads fresh every call.
- Budgets: per-call timeout kills and replaces the worker (an infinite
  loop export), call-count and wall-clock exhaustion, concurrency cap.
- Boundary: undeclared module id at the dispatcher, direct bridge
  import denied, facade of a pack not declared for the run denied.
- The same fixtures run on Node (vitest) and browser (the M2 shared
  fixture harness).

## Sequencing

Task 1 is independent and lands first. Task 2 → 3 → 4 build on each
other; Task 5 supplies the fixture Task 2 needs on day one (build it
first). Task 6 grows with each. Depends on M1 (loader, facade
mounting); browser-side tests depend on M2's harness. Independent of
M3.

## Exit criteria

- The reference module's export is callable from a Code node via its
  facade on server, CLI, and browser; the call runs on a worker,
  instance per call.
- Every budget bound is observable in a test, including
  timeout-terminate-replace.
- An adversarial guest cannot reach the dispatcher beyond the run's
  declared WASM surface.
- `npm run check` green on Node; the shared fixture suite green in the
  browser.
