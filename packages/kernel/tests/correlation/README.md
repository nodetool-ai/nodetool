# Correlation conformance suite

This directory exercises `docs/correlation-design.md` as an **algebra**, not
as bug regressions. Tests are organised by capability so coverage extends to
nodes the design has not classified yet.

## Algebra under test

| Rule                              | Where           |
| --------------------------------- | --------------- |
| `forward` preserves lineage       | `propagation/`  |
| `single` inherits invocation      | `propagation/`  |
| `iteration` extends with new root | `propagation/`  |
| `chunk` repeats same lineage      | `propagation/`  |
| sibling iteration outputs share token | `propagation/`, `explicit-joins/` |
| comparable-prefix scopes join     | `joining/`      |
| incomparable scopes reject        | `joining/`      |
| parent-scope reused for child key | `joining/`      |
| `aggregate` collapses one root    | `aggregation/`  |
| `drop` emits `lineage_done`       | `drops-closes/` |
| source EOS synthesizes `lineage_scope_closed` | `drops-closes/` |
| explicit join matches by identity | `explicit-joins/` |
| limits bound pending state        | `limits/`       |
| flag isolates behaviour           | `flag-compat/`  |
| descriptor validation rejects bad metadata | `descriptor-validation/` |
| Python bridge round-trips lineage | `bridge/` (blocked on PR 4a/4b) |

## Test levels

- **A. Unit** — `tests/correlation-analysis.test.ts`,
  `tests/correlation-signals.test.ts`,
  `packages/node-sdk/tests/correlation-validation.test.ts`.
  Pure static/inbox checks; no scheduler.
- **B. Kernel integration** — every file under this directory. Real
  `WorkflowRunner`, synthetic nodes via `_harness.ts`, full envelopes
  captured and asserted against.
- **C. Golden workflow e2e** — JSON workflows that resemble real user
  graphs. Lives under `fixtures/correlation/` (TBD; not yet populated).

## Assertion vocabulary

All conformance tests assert both **values** and **lineage**:

- Values catch user-visible bugs.
- Lineage catches future scheduler breakage *before* it reaches users
  (the classic FIFO-mispairing bug shows up as wrong pairs but identical
  values — only the lineage check catches it on a single iteration item).

Helpers live in `_assertions.ts`:

```ts
assertSameLineage(a, b);                    // forward
assertHasRoot(env, "fe:items");             // iteration extends
assertRootIndex(env, "fe:items", 2);        // specific token
assertRootCollapsed(env, "fe:items");       // aggregate collapses
assertNoIncomparableScopes(analysis);       // static
assertJoinRejected(error);                  // explicit join required
assertSiblingOutputsShareToken(             // emitGroup
  { left: leftEnvs, right: rightEnvs },
  "zip:zip"
);
assertScopeClosed(inbox, edgeId, {}, root); // close finalization
assertLineageDone(inbox, edgeId, key);      // drop skipping
```

## Adding a new case

1. Pick the capability directory that matches the rule you are testing.
2. Use `runWorkflow({ nodes, edges, executors, captureFrom })` from
   `_harness.ts` to wire the graph.
3. Assert on **both** the captured values (`valuesFrom(envelopes)`) and
   the lineage shape (`assertHasRoot`, `assertRootIndex`, ...).
4. If you find yourself testing "Zip works" instead of "iteration extends
   under Zip", you are at the wrong abstraction.
