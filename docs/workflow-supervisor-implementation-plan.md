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

## Phase A — the mechanism (kernel, no LLM) — **shipped**

PR 1 and PR 2 landed together: PR 1's allowed-set enforcement is only as good as
PR 2's invocation-scoped cost tracking, so shipping the first without the second
would have meant a window where `retry` was offered after a billed call.

### PR 1 — Escalation types and the actor hook

The seam, fail-closed. Zero behavior change.

- `packages/protocol/src/supervisor.ts`: `Escalation` (incl. optional `failureSignature`, `candidateOutput`, `retrySafe`), `Verdict`, message schemas `supervisor_escalation` / `supervisor_decision`; add to the `ProcessingMessage` union.
- `packages/kernel/src/supervisor.ts`: `SupervisorHandle` interface (`decide(e, signal)`), `FailClosedHandle` default.
- **Resolved-secret registry** on `ProcessingContext` (design §6.1): record every value the secret resolver hands out for the run's lifetime. Prerequisite for masking — today the context resolves one key and forgets.
- **Redaction at escalation construction** (design §6.1): the kernel-side constructor masks registry values and drops sensitive-named fields before the `Escalation` exists as a record — `Escalation` is public (messages, `RunResult`, websocket), so no unredacted instance may be constructed. Test: a planted secret in a node input never appears in any emitted message or `RunResult`.
- **Kernel-side allowed-action enforcement** (design §5.1): the actor computes the allowed set per escalation, sends it on the `Escalation`, and rejects (→ `fail`) any verdict outside it. Test: a hostile scripted handle returning `retry` for an unsafe node is rejected without the schema layer's help.
- **Recovery catch wraps `invoke()` only** (design §5.1): output routing stays outside; a routing failure after partial delivery fails the node without escalation. Test: edge-2-throws-after-edge-1-delivered never re-invokes.
- **Scope-closure plumbing for skip** (design §5.2): per-parent `lineage_scope_closed` emission for scopes the skipped invocation would have opened — `drop()` alone signals only `lineage_done`. Test: skipping one iterator invocation feeding an aggregate still lets the aggregate collapse.
- node-sdk: `RecoverableNodeError` (carries the malformed candidate output, redacted at construction like everything else) and the `retrySafe` node-metadata **opt-in**; declare it across the pure-compute and read-only node categories in shipped packages. `WorkflowNode`/`SubgraphNode` stay unsafe. Unknown ⇒ no retry.
- `packages/kernel/src/runner.ts`: `WorkflowRunnerOptions.supervisor`, wire `escalate` onto the execution context, `interventions` on `RunResult`.
- `packages/kernel/src/actor.ts`: wrap invocation execution per design §5.1 — buffered/correlated path first, controlled path second. `WorkflowSuspendedError` passes through untouched. Skip = `drop()` per output slot (design §5.2), never a bare return.
- **Audit while in here:** provider-level transient retry in `packages/runtime/src/providers/` (design §10.3). Done — [workflow-supervisor-provider-retry-audit.md](workflow-supervisor-provider-retry-audit.md). Gemini and Ollama have no backoff at all and would flood the supervisor with escalations a 2-second wait would fix; the fixes land in runtime, not here.
- Tests (`packages/kernel/tests/`): scripted `SupervisorHandle` doubles driving every verdict against fan-out, controlled, and single-fire nodes; retry re-invokes with identical inputs and properties; **skip on a correlated key prunes a downstream join whose other input already buffered** (the lineage_done case) plus the iterator→aggregate scope-closure case; no-supervisor runs byte-identical to before (message-stream snapshot).

### PR 2 — Bounds, retry safety, streaming carve-out

Still no LLM. Depends on PR 1.

- **Invocation-scoped cost/asset tracking** in `ProcessingContext` — via `AsyncLocalStorage` around `invoke()` or an explicit per-invocation accounting object, **not** a stack on the shared context: actors complete out of order and push/pop would cross-attribute (design §5.3). New plumbing — today cost aggregates per run in one slot and no asset-created flag exists. Test: two concurrent invocations completing in reverse order attribute correctly.
- `BoundedHandle` wrapper in kernel: `maxDecisions`, `maxRetriesPerNode`, per-decision timeout; every `decide()` gets a derived `AbortSignal` (run signal + timeout); `decidedBy: "bounds" | "default"` stamping. (Dollar reservation is agent-side, PR 3 — the kernel handle cannot see individual provider turns.)
- Allowed-set computation (consumed by PR 1's enforcement): `retry` only when `retrySafe` ∧ cost-free ∧ asset-free (design §5.3); `substitute` only with `candidateOutput` ∧ full validator coverage; streaming sets per design §5.4 — `run()` nodes get `end_stream` · `fail` only.
- **Runtime substitute validator** (design §5.2): per-output-type value rules — strict primitives, structural lists/objects, reference types must be well-formed refs that resolve against run storage; async, exposed for PR 3's acceptance hook.
- Sticky-verdict cache keyed by `(nodeId, failureSignature)` (`skip`/`fail` only), `decidedBy: "sticky"`; signatures come from a registry of error-shape recognizers (HTTP status, provider codes, validation paths) — a plain `Error` yields no signature and no stickiness.
- Tests: bounds degrade to deterministic fail; cancel during a pending decision resolves instantly; an undeclared node's allowed set has no retry; a plain-`Error` escalation has no substitute; a `run()` node's set is exactly {end_stream, fail}; a fabricated `{type:"image"}` ref with an unresolvable uri fails validation; sticky skip resolves the 7-of-200 case with one `decide()` call while a plain-`Error` failure on the same node escalates every time.

## Phase B — the agent and the CLI

### PR 3 — SupervisorAgent — **shipped**

Depends on PR 2.

Two additions the plan did not name, both forced by what the agent has to see:
`Escalation.declaredOutputs` (a repair cannot be typed, or accepted, without
the node's declared output types) and a kernel-side **`RunStateReader`** handed
to the handle via `SupervisorHandle.attach()` — the tools are pull-based over
runner state, and a handle is configured before the runner exists. Output
recording for `read_node_output` is bounded per node and happens only on a
supervised run.

Host-side schema validation checks the schema **as the caller wrote it**, not
the sanitized copy sent to the provider: the sanitizer injects
`additionalProperties: false` for strict structured-output modes, and enforcing
that would reject results no author ever forbade.

- `packages/agents/src/supervisor/supervisor-agent.ts`: `SupervisorHandle` via one `StepExecutor` per decision, verdict `outputSchema` (mirroring the escalation's allowed set), serialized queue; the `decide()` signal threads through `StepExecutor` into `provider.generateLoop({signal})` so abort kills the in-flight LLM request.
- **`TurnBudget` in the runtime provider layer** (design §6): `reserve/commit` object accepted via `generateLoop` options, honored before every model turn by the base loop and by native loop overrides (Claude Agent SDK provider explicitly). Worst-case reservation from the pricing catalog with explicit `supervisorMaxOutputTokens` (default 2048, never unset); no pricing entry ⇒ fail closed. This is a `packages/runtime` change with its own provider-contract test, not a wrapper in the agents package — a wrapper around `generateLoop()` cannot see individual turns.
- **`StepExecutor` extensions** (design §6): full host-side JSON-schema validation for `finish_step` (enums, nested fields, `additionalProperties`, discriminated unions — today it checks top-level type and required keys only) and an injectable **async acceptance callback** so a `substitute` becomes terminal only after the runtime validator (PR 2, storage resolution included) resolves; failures return as tool errors into the still-open conversation, `MAX_REPAIR_ROUNDS` (3) then `fail`. Both extensions are general `StepExecutor` features with their own tests.
- Tool-result redaction: `read_node_output` returns are the one supervisor input not derived from an already-redacted `Escalation` (that layer landed in PR 1, kernel-side); apply the same layer here.
- `packages/agents/src/supervisor/tools.ts`: `get_run_state`, `read_node_output` (read-only, redacted, truncated, **lineage-scoped** — reads resolve through the escalation's `correlation_lineage` and refuse anything outside it).
- `packages/agents/src/supervisor/prompt.ts`: verb semantics, skip-distrust, one-line rationale requirement.
- `supervisor:` memory keys for decisions + rationales.
- Tests: mock provider returning scripted tool-calls/verdicts; malformed verdict exercises the `finish_step` bounce loop; an unresolvable substitute ref bounces back into the open conversation; supervisor exceptions and timeouts resolve as `fail`; abort mid-decision cancels the provider call; a secret value planted in a `read_node_output` result never appears in the outbound prompt; in a fan-out, `read_node_output` refuses a sibling item's output; reservation blocks the $0.49+$0.30 overshoot mid-decision.

### PR 4 — CLI surface ∥ (with PR 5) — **shipped**

Depends on PR 3.

Two deviations the plan did not anticipate.

**`nodetool run` is a DSL command, not a session command.** `nodetool run
<dsl-file>` executes through `@nodetool-ai/dsl`'s own `run()`, which constructs
a `WorkflowRunner` directly — one of the grandfathered sites this PR is
forbidden to grow supervision on. So `--supervise` switches that command onto
`ExecutionSession` (`packages/cli/src/run-dsl-supervised.ts`) and the
unsupervised path stays byte-identical on the old one. One user-visible
consequence: the supervised path does not rethrow the first node error the way
the DSL path does. A node error the supervisor resolved is not a run failure;
only the run's terminal status decides.

**The summary line's item counts do not exist at run level.** "198/200 items"
presumes a batch the kernel never names: it counts invocations, not the items a
user thinks in. `formatSupervisedSummary` takes an optional item total for a
caller that knows one and otherwise reports decisions — `⛨ supervised: 2
skipped, 1 retried, 3 decisions, +$0.0200`.

The intervention record shipped as `Intervention` from `@nodetool-ai/protocol`
(minted in PR 1), unchanged — `RunResult.interventions`, the
`supervisor_decision` message, and the `--json` block are the same record, so
PR 6 has one shape to consume. The rollup and the two printed lines live in
`@nodetool-ai/execution` beside the debug reducer, so the CLI, the debug
bundle, and the HTTP debug endpoint cannot drift.

- **`ExecutionSessionOptions.supervisor`** in `packages/execution` — the single integration point; CLI and websocket surfaces configure the facade, never `WorkflowRunner` directly (design §7). Grandfathered direct-construction sites are out of scope but must not gain supervision ad hoc.
- `--supervise`, `--max-decisions`, `--max-retries`, `--supervisor-cost-cap`, `--supervisor-model` on `nodetool run` and `nodetool debug` (the latter through the shared debug service in `@nodetool-ai/execution`, not around it).
- Inline `⛨` intervention lines; interventions block in `--json`; supervised summary line ("198/200 items, 2 skipped, 3 decisions, +$0.02").
- Supervisor cost attributed through the existing cost tracking so `nodetool costs` sees it (PRD open question 3 resolved: attributed to the run, tagged `supervisor`).
- Docs: CLI section in root `CLAUDE.md` + `docs/cli.md`.

### PR 5 — Workflows as agents ∥ (with PR 4)

Depends on PR 3.

- `AgentOptions.graph?: GraphData | { workflowId: string }`; fourth branch in `Agent._executeImpl`: hydrate, run through `ExecutionSession` with self as supervisor, forward messages, `getResults()` returns run outputs. The branch adopts the common `AgentPolicy` object (`packages/agents/src/agent-policy.ts`); it does not add a fifth ad-hoc policy.
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

- `nodetool.control.Assert` in `packages/core-nodes/`: **deterministic in v1** — expression condition over its input; throws on failure, pass-through otherwise.
- The natural-language criterion variant is deferred: it needs a model, and `WorkflowRunnerOptions` has no provider/model policy — inventing one inside a node would sidestep the cost caps, consent copy, and provider allow-list this whole design routes model access through. It returns as a follow-up once a run-level model policy exists (it can then reuse the supervisor's own budget and boundary machinery).
- The PRD's "graph is the policy" counterpart: docs steer foreseeable checks here, not into supervisor config.

### PR 8 — Eval suite, replay, enable by default

Depends on PR 5–7.

- `ReplayHandle` (design §8) as the deterministic test double.
- **Workspace provider allow-list** (design §6.1): schema + API + runtime enforcement in provider resolution. Does not exist today (current allow-listing is global cloud pruning and frontend filtering); it is a named precondition of the default flip, so it lands here at the latest.
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
- **Cost/asset tracking cannot see external writes.** The `retrySafe` opt-in is the defense, and unknown defaults to unsafe — so the residual risk is a node *wrongly declared* `retrySafe`, not an undeclared one. Mitigation: PR 1's sweep declares only pure-compute/read-only categories; the review checklist for new nodes gains the question.
