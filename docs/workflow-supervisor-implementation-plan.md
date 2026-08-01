# Implementation Plan: Workflow Supervisor

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-08-01
**PRD:** [workflow-supervisor-prd.md](workflow-supervisor-prd.md)
**Design:** [workflow-supervisor-design.md](workflow-supervisor-design.md)

PRs marked ∥ can proceed in parallel once their listed dependency lands.

---

## 0. Ground rules

- Every PR passes `npm run check` and lands behavior-preserving unless its description says otherwise. PR 1 and PR 2 must be invisible to existing runs.
- The kernel never imports from `@nodetool-ai/agents`. The `SupervisorHandle` interface lives in kernel; implementations live above it.
- No UI work before the intervention record is stable in `--json` output (PR 4) — the web surface consumes the record, it does not define it.
- Verdict semantics change only via the design doc, in the same PR.

---

## Phase A — the mechanism (kernel, no LLM)

### PR 1 — Escalation types and the actor hook

The seam, fail-closed. Zero behavior change.

- `packages/protocol/src/supervisor.ts`: `Escalation`, `Verdict`, message schemas `supervisor_escalation` / `supervisor_decision`; add to the `ProcessingMessage` union.
- `packages/kernel/src/supervisor.ts`: `SupervisorHandle` interface, `FailClosedHandle` default.
- `packages/kernel/src/runner.ts`: `WorkflowRunnerOptions.supervisor`, wire `escalate` onto the execution context, `interventions` on `RunResult`.
- `packages/kernel/src/actor.ts`: wrap invocation execution per design §5.1 — buffered/correlated path first, controlled path second. `WorkflowSuspendedError` passes through untouched.
- Populate `Escalation.spentCostUsd` / `createdAssets` from `ProcessingContext` tracking, scoped per invocation.
- **Audit while in here:** provider-level transient retry in `packages/runtime/src/providers/` (design §10.3). File issues per gap; fixes land in runtime, not this PR.
- Tests (`packages/kernel/tests/`): scripted `SupervisorHandle` doubles driving every verdict against fan-out, controlled, and single-fire nodes; retry re-invokes with merged properties; skip produces untaken-branch pruning downstream; substitute type-check bounces invalid shapes; no-supervisor runs byte-identical to before (message-stream snapshot).

### PR 2 — Bounds, money guard, streaming carve-out

Still no LLM. Depends on PR 1.

- `BoundedHandle` wrapper in kernel: `maxDecisions`, `maxRetriesPerNode`, decision timeout racing the run's `AbortSignal`; `decidedBy: "bounds" | "default"` stamping.
- Verdict-schema narrowing: strip `retry` when money/assets spent (design §5.3); streaming-node verdict sets per design §5.4, including the `end-stream` mapping.
- Sticky-verdict cache for `applyTo: "node"` (`skip`/`fail` only), `decidedBy: "sticky"`.
- Tests: bounds degrade to deterministic fail; cancel during a pending decision resolves instantly; mid-stream failure offers only the narrowed set; sticky skip resolves the 7-of-200 case with one `decide()` call.

## Phase B — the agent and the CLI

### PR 3 — SupervisorAgent

Depends on PR 2.

- `packages/agents/src/supervisor/supervisor-agent.ts`: `SupervisorHandle` via one `StepExecutor` per decision, verdict `outputSchema`, serialized queue.
- `packages/agents/src/supervisor/tools.ts`: `get_run_state`, `read_node_output` (read-only, truncated).
- `packages/agents/src/supervisor/prompt.ts`: verb semantics, skip-distrust, one-line rationale requirement.
- `supervisor:` memory keys for decisions + rationales.
- Tests: mock provider returning scripted tool-calls/verdicts; malformed verdict exercises the `finish_step` bounce loop; supervisor exceptions and timeouts resolve as `fail`.

### PR 4 — CLI surface ∥ (with PR 5)

Depends on PR 3.

- `--supervise`, `--max-decisions`, `--max-retries`, `--supervisor-model` on `nodetool run` and `nodetool debug`.
- Inline `⛨` intervention lines; interventions block in `--json`; supervised summary line ("198/200 items, 2 skipped, 3 decisions, +$0.02").
- Supervisor cost attributed through the existing cost tracking so `nodetool costs` sees it (PRD open question 3 resolved: attributed to the run, tagged `supervisor`).
- Docs: CLI section in root `CLAUDE.md` + `docs/cli.md`.

### PR 5 — Workflows as agents ∥ (with PR 4)

Depends on PR 3.

- `AgentOptions.graph?: GraphData | { workflowId: string }`; fourth branch in `Agent._executeImpl`: hydrate, run with self as supervisor, forward messages, `getResults()` returns run outputs.
- Websocket: `supervise` flag on run requests; forward `supervisor_*` messages to clients; trigger-initiated runs default on.
- Tests: `Agent({graph})` returns identical outputs to a bare runner on a clean graph; interventions surface in the message stream.

## Phase C — the product surface

### PR 6 — Editor and run report

Depends on PR 4 (record shape frozen).

- Run-bar **Supervisor** toggle + three settings (model, max decisions, max retries); default on for triggered runs, off for interactive.
- Shield badges per verdict on nodes; "supervisor deciding…" node state; intervention feed panel (appears on first intervention only).
- Run report **Interventions** section with itemized skips; "Completed — supervised" derived display state.
- All via `ui_primitives`; feed cards reuse the chat agent-step card family.

### PR 7 — Assert node ∥ (with PR 6)

Depends on PR 1 only.

- `nodetool.control.Assert` in `packages/core-nodes/`: condition (expression) + optional natural-language criterion evaluated by the run's model; throws on failure, pass-through otherwise.
- The PRD's "graph is the policy" counterpart: docs steer foreseeable checks here, not into supervisor config.

### PR 8 — Eval suite, replay, enable by default

Depends on PR 5–7.

- `ReplayHandle` (design §8) as the deterministic test double.
- `nodetool eval supervisor` in `packages/agents/src/evals/`: fault-injection cases over the three PRD reference shapes (transient error, malformed output, poisoned item, mid-stream failure, budget exhaustion); metrics: recovery rate, decisions/run, false-wake rate, cost. `--min-success` CI gate like the other suites.
- Flip trigger-run default to on once recovery rate ≥ the PRD's 60% bar.
- Docs: user guide page; PRD/design status → Shipped.

---

## Sequencing

```
PR 1 → PR 2 → PR 3 → PR 4 ∥ PR 5 → PR 6 ∥ PR 7* → PR 8
                                        (*PR 7 only needs PR 1)
```

Two people: one takes 1→2→3 (kernel/agents), the other starts PR 7 after PR 1 and PR 6 mocks against the PR 4 record shape.

## Risks to the plan

- **The actor catch-path has three execution modes** (correlated, controlled, streaming) and the hook must behave identically in each. Mitigation: PR 1 lands correlated + controlled with the streaming carve-out stubbed to `fail`; PR 2 completes streaming. Snapshot tests on unsupervised runs guard regressions.
- **Verdict quality is unproven until PR 8.** The eval suite arrives last but gates the only risky default (trigger default-on). Everything before it ships opt-in.
- **Provider retry gaps** (design §10.3) would flood the supervisor with transient escalations. The PR 1 audit exists to surface this before PR 3 makes it expensive.
- **Invocation-scoped cost tracking** may need plumbing if `ProcessingContext` only aggregates per-run today; verify in PR 1 before the money guard in PR 2 depends on it.
