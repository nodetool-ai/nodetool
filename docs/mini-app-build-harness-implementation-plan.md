# Implementation Plan: Mini-App Build Harness

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-08-02
**PRD:** [mini-app-build-harness-prd.md](mini-app-build-harness-prd.md)
**Design:** [mini-app-build-harness-design.md](mini-app-build-harness-design.md)

Written to be executed by an implementing agent (Opus) PR by PR. Each PR names
its files, the invariants it must hold, and the tests that prove it. PRs
marked ∥ can proceed in parallel once their listed dependency lands.

---

## 0. Ground rules

- Every PR passes `npm run check` before commit. `packages/cli`,
  `packages/execution`, `packages/agents`, and `packages/websocket` are plain
  TS packages — no `build:packages` needed for their own tests, but run it
  before any end-to-end `nodetool app debug` smoke since the CLI loads
  decorator packages from `dist/`.
- Read before writing. The modules this plan touches are documented in-file:
  `packages/cli/src/app-debug/harness.ts` (orchestration),
  `packages/agents/src/evals/surfaces/app.ts` (bridge + drift rules),
  `packages/agents/src/evals/tool-loop-eval.ts` (loop driver),
  `packages/cli/src/commands/eval.ts` ("suites are data"). Honor the
  invariants their header comments state.
- The relocation PR (PR 3) is behavior-preserving and must be provably so:
  `nodetool app debug` output on the shipped example bundles is byte-identical
  before and after (modulo timestamps/paths).
- `BuildSpec`/`BuildReport` shapes change only via the design doc, in the same
  PR.
- No web UI work in this plan. The web surface (if any) consumes `BuildReport`
  after M4; it does not define it.
- Prose in reports and docs follows the repo style rules in
  `docs/WRITING_STYLE.md`.

## Phase M1 — close the oracle (independently shippable)

### PR 1 — Simulate conditions and format (R6)

All in `packages/cli/src/app-debug/` (pre-relocation — keep the diff where the
code lives today; PR 3 moves it wholesale).

- `runtime.ts`: after every fold into app state, evaluate each widget's
  `visibleWhen`/`disabledWhen` via `parseCondition`/`evaluateCondition` from
  `@nodetool-ai/app-runtime` (already exported — wire, don't reimplement).
  Track per-widget `{ visible, disabled }` in the runtime's widget state.
- `harness.ts`: an interaction step targeting a hidden or disabled widget
  fails that step with a message naming the condition source
  (`clicked "Approve" while hidden by \`draft == null\``). `set` steps that
  address state keys directly (not widgets) are exempt — they model the
  runtime, not a user.
- Display checks and `report.md` previews render through `formatTemplate`
  before comparison.
- `types.ts`: widget final-state record gains `visible`/`disabled`; the
  report's `notSimulated` (add the field if absent) no longer lists
  conditions/format.
- Verdict: new issue for a run-trigger widget whose `visibleWhen` never
  evaluated true in any executed interaction.
- Tests (`packages/cli/tests/` next to the existing app-debug tests): a
  conditional Approve button — hidden click fails, satisfied click runs; a
  `format` template changes an `equals` check's outcome; the never-visible
  trigger verdict fires; an app with no conditions produces an unchanged
  report.

### PR 2 — Headless resource provider (R7) ∥ (with PR 1)

- `runtime.ts`: `HeadlessResourceProvider` interface +
  `InMemoryResourceProvider` (design §4.2); the `resourceCommand` branch
  dispatches to it instead of no-opping.
- `harness.ts` + `types.ts`: `seedResource` interaction step; `from:
  "resource"` params resolve through the provider; resource widgets report
  collection state in the final report.
- Update the "Not simulated headlessly" paragraph in `CLAUDE.md` §
  `nodetool app debug` and [mini-apps.md](mini-apps.md) "Checking an app" —
  both currently list resources as unreachable.
- Tests: a picker-fed param runs with seeded items and fails with an
  actionable message when unseeded; a resource operation mutates the
  collection and the report shows it.

### PR 3 — Relocate the simulator to `@nodetool-ai/execution` (depends: PR 1, PR 2)

- Move `app-spec.ts`, `runtime.ts`, `types.ts`, and the simulation half of
  `harness.ts` to `packages/execution/src/app-debug/`; export from the package
  index the way `execution/debug` already does. `markdown.ts` moves too (it
  renders the report, needs nothing from cli).
- Stays in `packages/cli/src/app-debug/`: `app-target.ts` (DB/file
  resolution), bundle writing, the command wiring. It re-exports the moved
  types so `@nodetool-ai/cli` importers don't break.
- The harness's `runOnServer` / `loadFromDb` / `loadApplication` injections
  already isolate it from cli's debug internals — the move must not grow new
  parameters. Where `harness.ts` imports `../debug/collector.js`
  (`previewValue`) and `../debug/types.js`, move those *types* and the small
  preview helper into execution as well or inject them; do not drag the whole
  cli debug module along.
- Proof of behavior preservation: script a before/after `app debug --json` run
  over every bundle in `packages/base-nodes/nodetool/examples/apps/` and diff
  (normalize paths/timestamps). Keep the script in `scripts/` for PR review,
  delete before merge or park under the eval fixtures.

## Phase M2 — the loop

### PR 4 — Promote the bridge, extract the tool-loop driver (depends: PR 3)

- `packages/agents/src/app-build/bridge.ts`: move the bridge implementation
  out of `evals/surfaces/app.ts` verbatim — tool contract, catalog use, and
  the doc-meta passthrough to `@nodetool-ai/app-runtime` doc-ops are already
  correct there. Add `ui_app_finish` (bridge-only termination tool) and a
  `loadDocument` entry so repair rounds resume from the current document.
- `evals/surfaces/app.ts` becomes: re-export of the bridge + the eval cases.
  The file's header comment about drift updates to describe the new sharing.
- `packages/agents/src/app-build/tool-loop.ts`: extract the generic
  provider-driving loop from `tool-loop-eval.ts` (generateLoop over
  `HeadlessTool[]`, turn cap, transcript capture) into a function both the
  eval and the author stage call. The eval keeps its scoring; the loop moves.
- Tests: existing `app-tools` eval passes unchanged (that suite *is* the
  regression test for this PR); a unit test drives the bridge through
  `loadDocument` → edit → `finalState` round-trip.

### PR 5 — Types, spec stage, interaction derivation ∥ (with PR 4, depends: PR 3)

- `packages/agents/src/app-build/types.ts`: `BuildSpec`, `BuildIssue`,
  `BuildComplaint`, `StageRecord`, `BuildReport` per design §2.
- `spec.ts`: one `StepExecutor` call with `BuildSpec` as `outputSchema`; the
  host-side validation list from design §3.1, implemented against
  `WIDGET_CATALOG` and `parseBinding` — reuse the supervisor's `finish_step`
  bounce loop (it is a general `StepExecutor` feature since supervisor PR 3).
  `specFromFile` parses + validates without the LLM.
- `interactions.ts`: spec interactions are already `InteractionStep[]`; this
  module only *completes* them — prepend `set` steps for declared inputs that
  no step touches (using spec examples), and derive a minimal default
  interaction (the existing `defaultInteractions` shape) for any operation the
  spec forgot, flagging it as derived in the report.
- Tests: schema-valid-but-catalog-invalid specs bounce with the right issue;
  an unpinnable spec fails after 3 bounces; derivation covers a forgotten
  operation and never overwrites an authored step.

### PR 6 — Orchestrator, repair loop, `app build` CLI (depends: PR 4, PR 5)

The core PR. `packages/agents/src/app-build/build.ts` + the CLI command.

- `build.ts` — `buildApp(opts): Promise<BuildReport>`: the stage sequence from
  design §3.7. Plan wraps `GraphPlanner` per operation (existing-workflow
  binding first, IO-coverage check, one replan). Author runs the tool loop
  from PR 4 with the spec rendered as system prompt. Check/Run call the
  execution simulator on the in-memory `ApplicationBundle`. Judge is a stub
  returning `achieved: true` this PR (lands in PR 7); the verdict says so in
  `notSimulated`.
- Repair: complaints as full issue sets, fingerprints, oscillation guard,
  routing (Author default, Plan for graph-IO issues) — design §3.7 verbatim.
- Budgets: `maxRepairs`, wall-clock, and USD via `TurnBudget` reservation on
  every provider call (spec, plan, author turns). Exhaustion → `failed` with
  the budget named. `AbortSignal` threads into every stage.
- Ledger: stage provider calls attributed to the build id, `node_type:
  "app-build"`.
- Spans: `app.build` + per-stage children (design §6), via the existing agent
  span helpers.
- `packages/cli/src/commands/app.ts`: the `build` subcommand, flags and
  bundle layout per design §5.1. Exit 0 iff `verdict.ok`.
- Tests (`packages/agents/tests/`): a scripted provider (the eval harness's
  mock pattern) drives a full green build over a template workflow with zero
  real model calls; a complaint round edits rather than rebuilds (assert the
  document diff is scoped); oscillation ends the build; each budget
  exhaustion fails closed; cancel mid-author aborts cleanly. CLI test: `app
  build spec.json --json` on a deterministic spec emits a parseable
  `BuildReport` and writes the bundle layout.

## Phase M3 — the score

### PR 7 — Judge stage (R8) (depends: PR 6)

- `packages/agents/src/app-build/judge.ts`: per-interaction structured-output
  call following `evals/goal-judge.ts`; inputs and fail-closed rules per
  design §3.6. `--judge-model` flag + `NODETOOL_APP_JUDGE_MODEL`; default
  resolution picks a model ≠ builder when possible and records which ran.
- Wire into `build.ts` behind `--no-judge`; judge complaints route to Author.
- Tests: scripted judge verdicts flip the build outcome; judge timeout counts
  as not-achieved; deterministic path never invokes it.

### PR 8 — `app-build` eval suite (R5) (depends: PR 6; judge cases depend: PR 7)

- Cases in `packages/agents/src/evals/app-build-cases.ts`: ≥ 8 prompts
  meeting the PRD §4 bar (each case declares which medium-complexity traits it
  exercises, and the set covers all of them), plus 2 deterministic spec-file
  cases over template graphs with exact expected widget values, judge
  skipped.
- Runner in `evals/app-build-eval.ts`; one data entry in `EVAL_SUITES`
  (`packages/cli/src/commands/eval.ts`) — follow the file's "suites are data"
  rule, no new command block. Metrics and `--min-success` semantics per
  design §5.3.
- CI: deterministic cases join the Quality Gate; full suite gets a nightly
  workflow following the GenSpend sync workflow's shape (report artifact, no
  auto-merge decisions).
- Tests: the suite runs end-to-end on the deterministic cases in CI with no
  provider keys.

## Phase M4 — surfaces

### PR 9 — `build_app` server tool + HTTP (R9) (depends: PR 6; better after PR 7)

- Register `build_app` next to `debug_workflow`;
  `POST /api/applications/build` running `buildApp()`; long-build polling and
  cancel through `packages/websocket/src/debug-sessions.ts`. Auth and
  cost-cap defaults match `debug_workflow`'s posture.
- The tool result is the `BuildReport`; the bundle imports through the
  existing bundle-import endpoint, never auto-installs.
- Tests: route test with a scripted provider; cancel over HTTP aborts the
  build; the tool is listed for editor chat.

### PR 10 — Supervisor composition (R10) ∥ (with PR 9, depends: PR 6)

- `--supervise` + supervisor flags on `app build` configure
  `ExecutionSessionOptions.supervisor` for the Run stage's kernel executions —
  the same single integration point every surface uses. Interventions land in
  the interaction's run report and roll up into `BuildReport`.
- Test: a scripted supervisor skip during Run surfaces in the build report
  and does not count as a build failure when expectations still pass.

### PR 11 — P2 conveniences (R11, R12) (depends: PR 8)

- `--watch` on spec-file targets: re-run on save, print a verdict diff —
  reuse the `debug --watch` differ.
- Example-apps regeneration: `scripts/build-example-apps.mjs` gains a mode
  that runs `buildApp` from each curated spec and diffs against the shipped
  bundle, reporting drift without overwriting — the curated bundles stay
  hand-approved.

## Sequencing summary

```
M1: PR1 ∥ PR2 → PR3
M2: PR4 ∥ PR5 → PR6
M3: PR7 → PR8 (deterministic cases of PR8 can start after PR6)
M4: PR9 ∥ PR10 → PR11
```

The PRD's launch gate (§8) is measurable after PR 8; nothing in M4 blocks it.
