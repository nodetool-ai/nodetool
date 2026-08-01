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

- `packages/protocol/src/supervisor.ts`: `Escalation` (incl. optional `failureSignature`, `candidateOutput`, `retrySafe`), `Verdict`, message schemas `supervisor_escalation` / `supervisor_decision`; add to the `ProcessingMessage` union.
- `packages/kernel/src/supervisor.ts`: `SupervisorHandle` interface (`decide(e, signal)`), `FailClosedHandle` default.
- **Redaction at escalation construction** (design §6.1): the kernel-side constructor masks secret-store values and drops sensitive-named fields before the `Escalation` exists as a record — `Escalation` is public (messages, `RunResult`, websocket), so no unredacted instance may be constructed. Test: a planted secret in a node input never appears in any emitted message or `RunResult`.
- node-sdk: `RecoverableNodeError` (carries the malformed candidate output, redacted at construction like everything else) and the `retrySafe` node-metadata **opt-in**; declare it across the pure-compute and read-only node categories in shipped packages. `WorkflowNode`/`SubgraphNode` stay unsafe. Unknown ⇒ no retry.
- `packages/kernel/src/runner.ts`: `WorkflowRunnerOptions.supervisor`, wire `escalate` onto the execution context, `interventions` on `RunResult`.
- `packages/kernel/src/actor.ts`: wrap invocation execution per design §5.1 — buffered/correlated path first, controlled path second. `WorkflowSuspendedError` passes through untouched. Skip = `drop()` per output slot (design §5.2), never a bare return.
- **Audit while in here:** provider-level transient retry in `packages/runtime/src/providers/` (design §10.3). File issues per gap; fixes land in runtime, not this PR.
- Tests (`packages/kernel/tests/`): scripted `SupervisorHandle` doubles driving every verdict against fan-out, controlled, and single-fire nodes; retry re-invokes with merged properties; **skip on a correlated key prunes a downstream join whose other input already buffered** (the lineage_done case); substitute type-check bounces invalid shapes; no-supervisor runs byte-identical to before (message-stream snapshot).

### PR 2 — Bounds, retry safety, streaming carve-out

Still no LLM. Depends on PR 1.

- **Invocation-scoped cost/asset tracking** in `ProcessingContext`: a per-invocation scope pushed around each `process()` call (stacked, so nested sub-workflow runs attribute correctly). This is new plumbing — today cost aggregates per run in one slot and no asset-created flag exists.
- `BoundedHandle` wrapper in kernel: `maxDecisions`, `maxRetriesPerNode`, `maxSupervisorCostUsd`, per-decision timeout; every `decide()` gets a derived `AbortSignal` (run signal + timeout); `decidedBy: "bounds" | "default"` stamping.
- Verdict-schema narrowing: `retry` only when `retrySafe` ∧ cost-free ∧ asset-free (design §5.3); streaming verdict sets per design §5.4 — including withholding retry **and** substitute from `is_streaming_input` (`run()`) nodes in every state, and the `end-stream` mapping.
- **Runtime substitute validator** (design §5.2): per-output-type value rules — strict primitives, structural lists/objects, reference types must be well-formed refs that resolve against run storage; no rule for a type ⇒ no `substitute` arm.
- **Cost reservation** in `BoundedHandle`: worst-case pre-call reservation from the model-pricing catalog (input tokens + configured max output tokens); no pricing entry ⇒ fail closed.
- Sticky-verdict cache keyed by `(nodeId, failureSignature)` (`skip`/`fail` only), `decidedBy: "sticky"`; signatures come from a registry of error-shape recognizers (HTTP status, provider codes, validation paths) — a plain `Error` yields no signature and no stickiness.
- Tests: bounds degrade to deterministic fail; cancel during a pending decision resolves instantly; an undeclared node's schema has no retry arm; a `run()` node's schema never offers retry/substitute; a fabricated `{type:"image"}` ref with an unresolvable uri bounces; reservation blocks the $0.49+$0.30 overshoot; sticky skip resolves the 7-of-200 case with one `decide()` call while a plain-`Error` failure on the same node escalates every time.

## Phase B — the agent and the CLI

### PR 3 — SupervisorAgent

Depends on PR 2.

- `packages/agents/src/supervisor/supervisor-agent.ts`: `SupervisorHandle` via one `StepExecutor` per decision, verdict `outputSchema`, serialized queue; the `decide()` signal threads through `StepExecutor` into `provider.generateLoop({signal})` so abort kills the in-flight LLM request; `maxSupervisorCostUsd` checked before **every** provider call, mid-decision included.
- Tool-result redaction: `read_node_output` returns are the one supervisor input not derived from an already-redacted `Escalation` (that layer landed in PR 1, kernel-side); apply the same layer here.
- `packages/agents/src/supervisor/tools.ts`: `get_run_state`, `read_node_output` (read-only, redacted, truncated).
- `packages/agents/src/supervisor/prompt.ts`: verb semantics, skip-distrust, one-line rationale requirement.
- `supervisor:` memory keys for decisions + rationales.
- Tests: mock provider returning scripted tool-calls/verdicts; malformed verdict exercises the `finish_step` bounce loop; supervisor exceptions and timeouts resolve as `fail`; abort mid-decision cancels the provider call; a secret value planted in a `read_node_output` result never appears in the outbound prompt; reservation trips mid-decision.

### PR 4 — CLI surface ∥ (with PR 5)

Depends on PR 3.

- `--supervise`, `--max-decisions`, `--max-retries`, `--supervisor-model` on `nodetool run` and `nodetool debug`.
- Inline `⛨` intervention lines; interventions block in `--json`; supervised summary line ("198/200 items, 2 skipped, 3 decisions, +$0.02").
- Supervisor cost attributed through the existing cost tracking so `nodetool costs` sees it (PRD open question 3 resolved: attributed to the run, tagged `supervisor`).
- Docs: CLI section in root `CLAUDE.md` + `docs/cli.md`.

### PR 5 — Workflows as agents ∥ (with PR 4)

Depends on PR 3.

- `AgentOptions.graph?: GraphData | { workflowId: string }`; fourth branch in `Agent._executeImpl`: hydrate, run with self as supervisor, forward messages, `getResults()` returns run outputs.
- Websocket: `supervise` flag on run requests; forward `supervisor_*` messages to clients. Trigger rows carry the flag but it **defaults to off** — the flip to default-on belongs to PR 8's gate, nowhere earlier.
- Tests: `Agent({graph})` returns identical outputs to a bare runner on a clean graph; interventions surface in the message stream.

## Phase C — the product surface

### PR 6 — Editor and run report

Depends on PR 4 (record shape frozen).

- Run-bar **Supervisor** toggle + settings (model, max decisions, max retries, cost cap); off by default everywhere until PR 8. Toggle help text states what failure context is shared and with which model (the consent surface, design §6.1).
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
- `nodetool eval supervisor` in `packages/agents/src/evals/`: fault-injection cases over the three PRD reference shapes (transient error, malformed output, poisoned item, mid-stream failure, budget exhaustion). Metrics measure **unsafe recovery, not just recovery**: recovery rate, but also incorrect-skip rate (item skipped that a scripted verdict recovers), poisoned-repair rate (substitution passes validation but flunks the case's semantic check), duplicate-effect count (side-effect probe nodes counting executions), and cost-overrun count. `--min-success` CI gate like the other suites.
- Flip the trigger-run default only when **all** gates pass: recovery ≥ the PRD's 60% bar; incorrect-skip, poisoned-repair, duplicate-effect, and cost-overrun each under an explicit threshold set in the suite (duplicate effects and cost overruns: zero); and the data-boundary requirements (design §6.1) verified. The flip applies to **newly created triggers only** — existing triggers are never silently migrated; they get a one-time prompt (consent is forward-looking, design §6.1). Until then everything ships opt-in.
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
- **Invocation-scoped cost tracking is new plumbing** (confirmed: `ProcessingContext` aggregates per run, no asset flag). It is a first-class PR 2 deliverable; if the stacked-scope approach fights the context's structure, PR 2 grows rather than the retry-safety rule weakening.
- **Cost/asset tracking cannot see external writes.** The `sideEffects` declaration is the only defense for Publish/Upsert/Notify-shaped nodes, and it depends on node authors declaring it. Mitigation: PR 1 sweeps existing node packages for external-write nodes and declares them in the same PR; the review checklist for new nodes gains the question.
