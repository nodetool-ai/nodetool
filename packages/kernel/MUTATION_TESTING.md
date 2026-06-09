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

This is the baseline captured when the harness was added. Unlike
`@nodetool-ai/security` (a small, fully-hardened 100% package), the kernel is
large and these numbers are a **starting point to ratchet up**, not a finished
target.

```
File                    | % score | % covered | killed | timeout | survived | no cov
------------------------|---------|-----------|--------|---------|----------|-------
actor.ts                |   53.66 |     64.83 |    406 |       5 |      223 |    132
channel.ts              |   75.89 |     77.98 |     83 |       2 |       24 |      3
correlation-analysis.ts |   65.54 |     74.38 |    326 |       5 |      114 |     60
durable-inbox.ts        |   63.57 |     63.57 |     81 |       1 |       47 |      0
edge-ids.ts             |  100.00 |    100.00 |      4 |       0 |        0 |      0
graph-utils.ts          |   72.38 |     83.97 |    126 |       5 |       25 |     25
graph.ts                |   66.99 |     69.73 |    404 |       6 |      178 |     24
inbox.ts                |   84.98 |     89.58 |    204 |      11 |       25 |     13
io.ts                   |   80.52 |     88.57 |     62 |       0 |        8 |      7
runner.ts               |   50.30 |     55.99 |    421 |       4 |      334 |     86
suspendable.ts          |   63.64 |     68.29 |     28 |       0 |       13 |      3
trigger-manager.ts      |   33.59 |     53.75 |     43 |       0 |       37 |     48
trigger-wakeup.ts       |   53.75 |     54.43 |     43 |       0 |       36 |      1
trigger.ts              |   74.65 |     76.81 |     53 |       0 |       16 |      2
------------------------|---------|-----------|--------|---------|----------|-------
All files               |   61.02 |     68.26 |   2284 |      39 |     1080 |    404
```

- **`% score`** counts every mutant (no-coverage mutants count against you).
- **`% covered`** scores only mutants that at least one test exercised — the
  fairer measure of test *quality* vs. test *reach*.

The config gate (`stryker.config.json`) **breaks below 55%**, a few points under
the current 61% so it gates a test-quality regression while absorbing
run-to-run timeout variance. Raise `thresholds.break` (and `low`/`high`) as the
suite is hardened — treat the baseline as a floor that only moves up.

## Where to focus

Ranked by surviving mutants (highest leverage first):

1. **`runner.ts`** (334 survived, 50%) and **`actor.ts`** (223, 54%) — the
   execution core. Many survivors are *no-coverage* (86 / 132), so start by
   covering untested branches, then pin observable behaviour on the rest.
2. **`graph.ts`** (178) and **`correlation-analysis.ts`** (114) — graph
   validation and join/scope logic; survivors here are usually missing boundary
   and error-path assertions.
3. **`trigger-manager.ts`** (33% score, 48 no-coverage) — lowest-scoring file;
   largely a coverage gap.

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
