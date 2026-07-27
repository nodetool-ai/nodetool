# Mutation Testing — `@nodetool-ai/kernel`

The kernel is the correctness engine of the platform — the workflow graph, the
NodeInbox, the Actor runtime, the WorkflowRunner, and the correlation analysis
that decides which messages join. A silent bug here mis-routes or drops messages
across *every* workflow, so its tests are verified with **mutation testing** in
addition to ordinary coverage. Line coverage only proves code *ran*; mutation
testing proves the tests would actually *fail* if the behaviour changed.

## Running it

```bash
npm run test:mutation --workspace=packages/kernel
# or, from packages/kernel:
npx stryker run

# Iterate on a single file (much faster):
npx stryker run --mutate "src/inbox.ts"
```

The HTML report lands in `reports/mutation/mutation.html` and the machine-readable
report in `reports/mutation/mutation.json` (both git-ignored). Open the HTML
report to browse surviving mutants file-by-file, line-by-line.

A full run mutates ~3,800 mutants and takes ~40 min on 4 cores; scope to one
file with `--mutate` while hardening a specific module.

## Configuration notes

Two settings differ from a vanilla Stryker setup and exist for concrete reasons
(see `stryker.config.json`):

- **`inPlace: true`** — kernel tests import sources directly
  (`../src/graph.js`) and `vitest.config.ts` aliases sibling packages with
  relative paths (`../protocol/src`). Stryker's default sandbox copies the
  project into `.stryker-tmp/`, which moves those relative aliases out from under
  the tests and yields *"No tests were found"*. Running in place mutates the real
  files and restores them from `.stryker-tmp/backup-*` on exit.
- **`vitest.related: false`** — sources pull `@nodetool-ai/runtime` from its
  built `dist`, so vitest's related-test module graph can't link a mutant back to
  the tests that cover it. Disabling related mode loads the whole suite; `perTest`
  coverage analysis still narrows the tests run *per mutant*.

## Current baseline

Captured from a full run of 3,889 mutants (~21 min on 4 cores). Eleven of the
thirteen mutated files are at 100%; the execution core is not, and is where the
remaining work is.

```
File                    | % score | % covered | killed | timeout | survived | no cov
------------------------|---------|-----------|--------|---------|----------|-------
actor.ts                |   83.43 |     88.38 |    694 |      21 |       94 |     48
correlation-analysis.ts |  100.00 |    100.00 |    440 |       4 |        0 |      0
durable-inbox.ts        |  100.00 |    100.00 |    113 |       1 |        0 |      0
edge-ids.ts             |  100.00 |    100.00 |      4 |       0 |        0 |      0
graph-utils.ts          |  100.00 |    100.00 |    157 |       5 |        0 |      0
graph.ts                |  100.00 |    100.00 |    594 |       6 |        0 |      0
inbox.ts                |  100.00 |    100.00 |    235 |      12 |        0 |      0
io.ts                   |  100.00 |    100.00 |     78 |       0 |        0 |      0
runner.ts               |   79.73 |     80.66 |    826 |       0 |      198 |     12
suspendable.ts          |  100.00 |    100.00 |     27 |       0 |        0 |      0
trigger-manager.ts      |   99.03 |     99.03 |    102 |       0 |        1 |      0
trigger-wakeup.ts       |  100.00 |    100.00 |     99 |       0 |        0 |      0
trigger.ts              |  100.00 |    100.00 |     68 |       1 |        0 |      0
------------------------|---------|-----------|--------|---------|----------|-------
All files               |   90.81 |     92.25 |   3437 |      50 |      293 |     60
```

- **`% score`** counts every mutant (no-coverage mutants count against you).
- **`% covered`** scores only mutants that at least one test exercised — the
  fairer measure of test *quality* vs. test *reach*.

The config gate (`stryker.config.json`) **breaks below 85%**, a few points under
the current 90.81% so it gates a test-quality regression while absorbing
run-to-run timeout variance. Raise `thresholds.break` (and `low`/`high`) as the
suite is hardened — treat the baseline as a floor that only moves up.

## Where to focus

Only two files still have meaningful survivors, and both are the execution core:

1. **`runner.ts`** (198 survived, 79.73%) — the largest remaining block is
   span-attribute and message-payload literals in the correlation and
   edge-counter regions, best attacked from the correlation test files rather
   than a runner fixture.
2. **`actor.ts`** (94 survived, 48 no-coverage, 83.43%) — the no-coverage
   cluster is in `isReady`'s list-input branches and `collect()` for multi-edge
   list handles gated on `inbox.isOpen`. Reaching those needs a max-scope list
   handle with a live driver, i.e. a real correlation graph rather than a
   synthetic actor.

When killing a mutant, target **observable behaviour**, not implementation
details — each test should pin one externally-meaningful property and read as
Arrange/Act/Assert. A test that only raises the score without asserting a real
contract is noise.

## Equivalent & non-behavioral mutants

Some survivors **cannot** be killed because they don't change observable
behaviour — chasing them is wasted effort. Suppress those at the source with a
line-scoped `// Stryker disable next-line <mutator>: <reason>` comment that
documents *why*, so the headline score reflects test quality over *behavioural*
code rather than being penalised by mutants no test could legitimately catch.
The most common class here is **logger-name string literals**
(`createLogger("nodetool.kernel.trigger")` → `createLogger("")`): the logger
name is a diagnostic label for humans, not a behavioural contract, so it is
deliberately not asserted.

Suppression is the one tool here that can *lie*. A wrong or misplaced `disable`
raises the score without any test behind it, and nothing in the report flags it.
Two failure modes have already been found in this package:

- **A wrong equivalence claim.** Two guards in `graph.ts` were suppressed as
  "equivalent" when they were load-bearing: a string-valued `dynamic_properties`
  spreads its character indices into node properties via `Object.assign`, and a
  string-valued `propertyTypes` derives bogus declared keys. Both are now killed
  by tests instead.
- **A comment on the wrong line.** `next-line` binds to exactly one line, so a
  comment above a multi-line `log.warn(...)` or a chained template covers only
  the first line — the mutants on lines 2+ survive, and the comment reads as if
  they were handled.

Before suppressing, apply the mutant by hand and confirm no test *could*
observe it. If writing the test is merely awkward, that is not equivalence —
leave the mutant surviving rather than papering over it.
