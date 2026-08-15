# Design: Mini-App Build Harness

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-08-02
**PRD:** [mini-app-build-harness-prd.md](mini-app-build-harness-prd.md)
**Implementation plan:** [mini-app-build-harness-implementation-plan.md](mini-app-build-harness-implementation-plan.md)

How `nodetool app build` turns a prompt into a verified `ApplicationBundle`.
The PRD says what and why; this says where the code goes, what each stage's
contract is, and which existing modules do the work.

---

## 1. Placement

The loop needs three things at once: `authorGraph` (`@nodetool-ai/agents`), the
app document ops (`@nodetool-ai/app-runtime`), and the headless app simulator
(today `packages/cli/src/app-debug/`). The dependency graph already almost
allows it:

```
app-runtime ──┐
execution ────┼──▶ agents ──▶ { cli, websocket }
kernel ───────┘
```

- `agents` depends on `app-runtime` and `execution` today.
- `cli` and `websocket` both depend on `agents` today.

One move makes it work: **the app-debug simulation core relocates from
`packages/cli/src/app-debug/` to `packages/execution/src/app-debug/`**. This is
the same move `debug_workflow` already forced for the workflow harness — its
summary reducer and triage live in `@nodetool-ai/execution/debug` precisely so
CLI and server surfaces cannot drift. `execution` has every dependency the
simulator needs (kernel, node-sdk, protocol, runtime), and the harness is
already decoupled from CLI concerns: `AppDebugDeps` injects `loadFromDb`,
`loadApplication`, and `runOnServer`, so the move carries no DB or filesystem
code with it. The CLI keeps target resolution (files, DB ids), bundle writing,
and the command itself, re-exporting the moved types.

New code:

```
packages/agents/src/app-build/
  types.ts        # BuildSpec, BuildReport, BuildComplaint, stage records
  spec.ts         # Spec stage (StepExecutor + schema)
  bridge.ts       # ui_app_* headless bridge, promoted from evals/surfaces/app.ts
  author.ts       # Author stage (tool loop over the bridge)
  interactions.ts # Interaction-script derivation from the spec
  judge.ts        # Judge stage (goal-judge pattern)
  build.ts        # Orchestrator: stages, repair loop, budgets
packages/execution/src/app-debug/   # relocated simulator (app-spec, runtime, harness)
packages/cli/src/commands/app.ts    # + `app build` subcommand
packages/websocket/src/...          # HTTP surface
```

The evals keep working against the same surfaces: `evals/surfaces/app.ts`
shrinks to a re-export of `app-build/bridge.ts` plus its cases, so the eval and
the production author stage cannot diverge — the drift-prevention rule that
file already documents, now enforced by sharing the implementation, not just
the contract.

## 2. Types

All in `packages/agents/src/app-build/types.ts`; the report shape also lands in
`@nodetool-ai/protocol` if the web surface consumes it (M4), mirroring how
`Intervention` moved.

```ts
/** What the Spec stage produces and every later stage consumes. */
interface BuildSpec {
  title: string;
  operations: Array<{
    id: string;                       // stable slug, e.g. "draft"
    objective: string;                // authorGraph objective, or —
    workflowId?: string;              // — bind an existing workflow instead
    inputs: Array<{ name: string; type: string; example: unknown }>;
    outputs: Array<{ name: string; type: string }>;
    streaming: boolean;
  }>;
  variables: Array<{ id: string; scope: "app" | "instance"; persist: boolean;
                     writtenBy: string; readBy: string[] }>;
  widgets: Array<{ role: string; type: string; binding: string;
                   label: string; container?: string;
                   visibleWhen?: string }>;   // condition source, verbatim
  interactions: Array<{                        // the behavioral contract
    name: string;                              // "draft-then-approve"
    steps: InteractionStep[];                  // the app-debug script language
    expect: Array<{ widget: string; check: "nonEmpty" | "equals" | "matches";
                    value?: unknown }>;
  }>;
}

/** One repair round's input: everything wrong, not a delta. */
interface BuildComplaint {
  round: number;
  issues: BuildIssue[];              // stage, severity, message, widget/op ref
  fingerprints: string[];            // stable ids for oscillation detection
}

interface BuildReport {
  target: { prompt: string; specPath?: string };
  spec: BuildSpec;
  interactions: CompletedInteraction[];  // what Run replayed: authored steps
                                         // plus seeded inputs and derived runs,
                                         // each flagged (§3.5)
  stages: StageRecord[];             // one per stage execution, repairs included
  repairs: BuildComplaint[];
  appDebug: AppDebugReport | null;   // the final Check+Run evidence, verbatim
  judge: JudgeRecord | null;
  verdict: { ok: boolean; reason: string; notSimulated: string[] };
  cost: { usd: number; byStage: Record<string, number> };
  bundle: ApplicationBundle | null;  // null only when verdict.ok is false
}
```

`InteractionStep` is the existing app-debug script language (`set`, `click`,
`change`, `run`, `cancel`) — the spec's behavioral contract is written in the
oracle's own vocabulary, so Run needs no translation layer.

## 3. Stages

### 3.1 Spec

One `StepExecutor` call with `BuildSpec` as the `outputSchema`. The prompt
carries the widget catalog (`WIDGET_CATALOG` names, binding modes, fields), the
operation policy vocabulary, and the medium-complexity shapes from the guide.
Host-side validation beyond the schema, before any planning token is spent:

- every widget `type` exists in `WIDGET_CATALOG`; its `binding` parses
  (`parseBinding`) and names a declared operation input/output or variable;
- every variable's `writtenBy`/`readBy` name declared operations or widgets;
- every interaction's steps reference declared widgets/operations, and every
  `expect` names a display widget;
- at least one interaction per operation.

Failures bounce back into the open `StepExecutor` conversation as tool errors
(the supervisor's `finish_step` repair loop, reused as-is, `MAX_REPAIR_ROUNDS`
= 3). A prompt that cannot be pinned — no operations derivable, or the model
asks for widgets the catalog lacks — resolves as `failed` at this stage with
the validation record as the reason. That is the PRD's "refuse rather than
guess."

`app build spec.json` enters here: parse, validate with the same code, skip
the LLM.

### 3.2 Plan

Per spec operation, in declaration order:

- `workflowId` set → load the workflow, `validateGraph`, extract IO
  (`extractAppIO`), and check the spec's declared inputs/outputs against it.
  A mismatch is a spec-stage complaint, not a planning job.
- otherwise → `authorGraph(objective, {...})` with `inputs` seeded
  from the spec's examples and `outputSchema` derived from the declared
  outputs. The authoring sub-agent already checks its own graph with
  `validate_workflow`; the harness adds `validateGraph` + a check that the
  planned graph's Input/Output node names cover the spec's declared surface — the app cannot
  bind to an input the planner renamed. Missing names → one replan with the
  delta named in the objective; still missing → `failed`.

Planned graphs are held in memory as bundle entries — nothing writes to the
database. That is what makes the loop runnable in CI and what makes the output
an `ApplicationBundle` rather than a pile of rows.

### 3.3 Author

The tool loop from `tool-loop-eval` (provider `generateLoop` over
`HeadlessTool[]`), promoted to production: the model drives the real `ui_app_*`
contract against the bridge, starting from an empty document plus the bundle's
workflows as `BindableWorkflow`s. The system prompt is the spec, rendered:
operations to declare (with exact input/output mappings), variables, the widget
list with bindings, the container structure.

Termination: the model calls `ui_app_finish` (new bridge-only tool) or the
turn cap (default 40 tool calls) trips. The bridge's `finalState()` yields the
Puck document + `AppDocMeta`, assembled into the draft `ApplicationBundle`.

On repair rounds the loop resumes with the *current* document loaded and the
`BuildComplaint` rendered as the opening message — the model edits, it does
not rebuild. Fingerprints that reappear after being absent end the loop (§5).

### 3.4 Check

`validateApp` from the relocated simulator, against the in-memory bundle
(`app debug`'s existing `ApplicationBundle` target path, no DB). Errors →
complaint; warnings ride along in the report but do not block. Then
`validateGraph` per workflow again — authoring cannot change graphs today, but
the gate is cheap and the invariant ("no LLM judge ever sees a statically
invalid app") should not depend on that staying true.

### 3.5 Run

For each spec interaction, one simulator pass
(`runAppDebug` equivalent on the in-memory bundle) with that interaction's
steps, then the `expect` checks against the folded final state:

- `nonEmpty` — the widget's state key received a value from a completed run;
- `equals` / `matches` — value comparison after `formatTemplate` is applied,
  so the check sees what the user would see.

Failed expectations and simulator verdict issues both become complaints. The
existing per-operation policy/timeout machinery applies unchanged; a spec
interaction may exercise `cancel` and replacement policies like a hand-written
script does today.

### 3.6 Judge

The `goal-judge` pattern from `graph-e2e`: one structured-output LLM call per
interaction, given the spec's plain-language intent, the interaction's steps,
and the final widget states (previewed with the same `previewValue` truncation
the debug collector uses). Output: `{ achieved, confidence, reasons }`.
`achieved: false` → complaint carrying the reasons.

The judge runs only on a Check+Run-green app, is configured independently
(`--judge-model`, default: a different model than the builder), and is skipped
for deterministic eval cases. Judge failures (timeout, unparseable) count as
not-achieved — fail closed, same rule as everywhere else.

### 3.7 Repair

The orchestrator (`build.ts`) is a plain loop, not an agent:

```
spec → plan → author ─▶ check ─▶ run ─▶ judge ─▶ ok? ─▶ bundle + report
                ▲          │        │       │
                └──────────┴────────┴───────┘   complaints, rounds ≤ maxRepairs
```

- Complaints route to **Author** by default. A complaint that names a missing
  graph input/output (Plan's responsibility) routes to Plan for that one
  operation, then falls through Author again. Spec is never revisited after it
  validates — a bad spec fails, it doesn't mutate, so the target the judge
  scores against is fixed for the whole build.
- **Oscillation guard:** every issue gets a stable fingerprint
  (stage + code + widget/op ref). A fingerprint absent in round N that
  reappears in round N+1 ends the build as `failed` with both rounds cited.
- **Budgets:** `maxRepairs` (default 3), wall clock (default 10 min), and USD.
  Dollar enforcement reuses `TurnBudget` from the runtime provider layer
  (built for the supervisor): every stage's provider call reserves
  worst-case before the turn. Exhaustion mid-stage resolves that stage as
  failed and the build as `failed` — reported, never silent.

## 4. Oracle closures

### 4.1 Conditions and format (R6)

`@nodetool-ai/app-runtime/conditions.ts` already exports `parseCondition`,
`evaluateCondition`, `readRef`, and `formatTemplate` — the web runtime's
implementations. The gap is that the headless runtime never calls them. Fix,
in the (relocated) simulator:

- After every fold step, evaluate each widget's `visibleWhen`/`disabledWhen`
  against current state and record it in the widget's simulated state.
- A `click`/`change`/`set`-via-widget step on a currently hidden or disabled
  widget is a **run failure** ("clicked Approve while hidden by
  `draft == null`"), because no user could perform it.
- Display expectations evaluate against the `format`-rendered value.
- The report's `notSimulated` list drops these entries and keeps only what
  remains genuinely browser-only (layout, focus, CSS).

The verdict gains one check: a widget whose condition never becomes satisfiable
across all executed interactions (always-hidden trigger) is an error — today's
"app with no run trigger" check, generalized.

### 4.2 Resources (R7)

The headless runtime's `resourceCommand` branch currently no-ops ("headless
runs have no resource providers attached"). Add:

```ts
interface HeadlessResourceProvider {
  kind: ResourceKind;
  list(): ResourceItem[];
  get(id: string): ResourceItem | null;
  apply(op: ResourceOperation): void;   // the doc-ops mutation verbs
}
```

with one in-memory implementation, seedable from the interaction script
(`{ seedResource: { id, items } }` step) or from `--params`. `from: "resource"`
params resolve through it; resource widgets (picker, gallery, scene list)
report their collection state like bound widgets report values. The web
runtime is untouched — this provider exists only under the simulator.

## 5. Surfaces

### 5.1 CLI

`packages/cli/src/commands/app.ts` gains `build`:

```
nodetool app build "<prompt>" | spec.json
  -p/--provider, -m/--model          builder provider (registry ids, as everywhere)
  --judge-model <provider/model>     default: NODETOOL_APP_JUDGE_MODEL or a
                                     different model than the builder
  --workflow <id> (repeatable)       pin existing workflows; Plan binds, never plans
  --max-repairs <n>  --cost-cap <usd>  --timeout <ms>
  --out <dir>  --json  --no-judge
```

Bundle layout extends the app-debug convention:
`nodetool-debug/app-build-<slug>-<ts>/` with `report.json` (`BuildReport`),
`report.md`, `app.bundle.json` (the deliverable), `spec.json`, and one
`interactions/<name>/` per interaction holding that pass's
`run-N.messages.jsonl`. Exit code 0 iff `verdict.ok`.

### 5.2 Server HTTP (M4)

`POST /api/applications/build {prompt | spec, options}` runs the same
`buildApp()` from `@nodetool-ai/agents`. Long builds use the existing
debug-session machinery (`packages/execution/src/service/debug-sessions.ts`) for
polling and cancel, and the bundle behind a green verdict is imported through
the normal bundle-import path.

There is no matching agent tool. A `build_app` capability shipped and was
removed: it put a second, invisible agent between the user and their app, and
the editor agent can already do every stage itself with the `ui_app_*` tools and
`debug_app`. The route stays for the CLI and the eval suite.

### 5.3 Eval suite

One `EVAL_SUITES` entry (`eval.ts` — suites are data): id `app-build`. A case
is a prompt (or spec, for the deterministic ones), a target-shape checklist
(operations ≥ 2, a persisted variable, a working conditional, …), and for
deterministic cases exact expected widget values with the judge skipped.
Metrics: one-shot rate (green with zero repairs), green-within-budget rate,
repair rounds, cost, duration; `--min-success` gates on green-within-budget.
Two deterministic cases (template-only workflows, no model calls in the
*product* under test) run in CI on every PR; the full suite runs nightly.

## 6. Telemetry and cost attribution

```
app.build                       (orchestrator)
  app.build.spec                (StepExecutor → llm.chat)
  agent.plan                    (authorGraph, existing span, per operation)
  app.build.author              (tool loop → llm.chat per turn)
  app.build.check
  app.build.run                 (→ workflow.run per interaction, existing)
  app.build.judge               (→ llm.chat)
```

Every provider call carries the existing `gen_ai.usage.*` attributes; ledger
rows are attributed to the build id and tagged `app-build` in `node_type`, so
`nodetool costs` answers "what did generated apps cost this month" the same
way it answers it for the supervisor.

## 7. Failure modes

Every row resolves as a reported `failed` build — no partial success, no
silent bundle.

| Failure | Resolution |
| --- | --- |
| Spec unpinnable / fails validation after 3 bounces | `failed`, validation record as reason |
| Planner returns null / planned IO can't cover spec after 1 replan | `failed`, per-operation planning record |
| Author turn cap trips without `ui_app_finish` | current document goes to Check anyway; its complaints count as the round's result |
| Oscillation (fixed issue reappears) | `failed`, both rounds cited |
| Any budget exhausted (rounds, wall clock, USD) | `failed`, best attempt's report attached, budget named |
| Judge timeout / unparseable | interaction counts as not-achieved |
| Kernel run crash during Run | the simulator's existing error surface → complaint; a second identical crash in the next round is oscillation |
| Cancel (signal) | aborts the in-flight provider call and kernel run; `failed`, `reason: "cancelled"` |
