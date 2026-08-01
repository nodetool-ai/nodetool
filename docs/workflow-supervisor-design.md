# Workflow Supervisor — Technical Design

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-08-01
**PRD:** [workflow-supervisor-prd.md](workflow-supervisor-prd.md)
**Implementation plan:** [workflow-supervisor-implementation-plan.md](workflow-supervisor-implementation-plan.md)

---

## 1. Summary

One primitive: a failing node invocation raises an **escalation**; a handler returns a **verdict** — retry, substitute, skip, or fail. The hook lives in `NodeActor`'s catch path and defaults to fail, so a runner without a supervisor behaves exactly as today. The supervisor itself is not new machinery: it is a `StepExecutor` with a verdict output schema and two read-only tools.

The kernel stays the executor. The graph stays the plan. The agent supplies judgment only at the moment a step breaks, which is what makes a supervised workflow "run like an agent" without giving up deterministic steps.

## 2. Design goals

1. **Zero cost on clean runs.** No supervisor code executes unless an invocation throws after its own error handling is exhausted.
2. **Fail-closed everywhere.** Any failure *of* the supervisor (timeout, invalid verdict, provider down) resolves as `fail` — today's behavior.
3. **One hook, no scheduler changes.** The correlation system, streaming actors, control edges, and EOS semantics are untouched. The supervisor cannot rewire the graph.
4. **Interventions are data.** Every escalation and verdict is a `ProcessingMessage` and lands in `RunResult`, so audit, replay, and UI are consumers of one record, not three features.

## 3. Architecture

```
NodeActor (packages/kernel/src/actor.ts)
  process() throws
    └─ ctx.escalate({nodeId, invocationKey, detail, inputs})   ← the only new kernel seam
         │  (default handler: () => ({action: "fail"}))
         ▼
SupervisorHandle (packages/kernel/src/supervisor.ts)
  serialized queue · sticky-verdict cache · bounds · timeout
         │ one escalation at a time
         ▼
SupervisorAgent (packages/agents/src/supervisor/)
  = StepExecutor + Verdict outputSchema + {get_run_state, read_node_output}
         │ finish_step(verdict)
         ▼
NodeActor applies the verdict:
  retry      → call process() again with merged properties
  substitute → validate against output TypeMetadata, then emit
  skip       → return without emitting (kernel treats as untaken branch)
  fail       → today's error path
```

The kernel package defines the `SupervisorHandle` interface and ships a no-op default; the LLM-backed implementation lives in `@nodetool-ai/agents`. The dependency arrow stays `kernel ← agents`, unchanged.

## 4. Types

In `@nodetool-ai/protocol` (they cross the kernel/agents boundary and appear in messages):

```ts
export interface Escalation {
  nodeId: string;
  invocationKey: string;           // lineage/iteration token; "" for single-fire nodes
  nodeType: string;
  detail: string;                  // the thrown error, stringified
  inputs: Record<string, unknown>; // the invocation's input values, truncated
  attempt: number;                 // 1-based, per (nodeId, invocationKey)
  spentCostUsd: number;            // provider cost already recorded by this invocation
  createdAssets: boolean;
}

export type Verdict =
  | { action: "retry"; properties?: Record<string, unknown> }
  | { action: "substitute"; outputs: Record<string, unknown> }
  | { action: "skip"; applyTo?: "invocation" | "node" }   // default "invocation"
  | { action: "fail"; reason?: string };
```

`applyTo: "node"` is the sticky form: the handle caches the verdict for the node and resolves later escalations from the same node without waking the agent (PRD scenario 2 — 7 identical failures, 1 LLM call). Only `skip` and `fail` may stick; a sticky `retry` or `substitute` would blindly replay a decision made against different inputs.

New `ProcessingMessage` variants: `supervisor_escalation` and `supervisor_decision` (escalation + verdict + `decidedBy: "agent" | "sticky" | "bounds" | "default"` + cost). Both flow through the existing `_emit` path.

`RunResult` gains:

```ts
interventions?: Array<{ escalation: Escalation; verdict: Verdict; decidedBy: string }>;
```

Status stays the existing enum. "Completed — supervised" is `status: "completed"` with a non-empty `interventions` — a derived display state, not a fifth status, so every existing consumer of `status` keeps working.

## 5. The kernel hook

### 5.1 Where it sits

`ProcessingContext` gains one optional member, `escalate?: (e: Escalation) => Promise<Verdict>`, wired by `WorkflowRunner` from a new option:

```ts
export interface WorkflowRunnerOptions {
  // ...existing
  supervisor?: SupervisorHandle;
}

export interface SupervisorHandle {
  decide(e: Escalation): Promise<Verdict>;
  close(): void;
}
```

`NodeActor` wraps each invocation's execution. Pseudocode for the buffered/correlated path (`_executeWithInputs`):

```ts
for (;;) {
  try {
    return await this.invoke(inputs);
  } catch (err) {
    if (err instanceof WorkflowSuspendedError) throw err;      // suspend is not failure
    const verdict = await this.escalateOrFail(err, inputs);    // fail-closed
    switch (verdict.action) {
      case "retry":      mergeProperties(verdict.properties); continue;
      case "substitute": this.emitValidated(verdict.outputs);  return;
      case "skip":       return;                                // no emit → untaken branch
      case "fail":       throw err;
    }
  }
}
```

Retry is a plain loop re-entry: the invocation's inputs are still in scope, so nothing is reconstructed and no scheduler state is touched. The same wrapper applies to the controlled path (`_runControlled`, per control event) and to input dispatch.

### 5.2 What each verdict means to the kernel

- **retry** — `properties` are merged via the existing `updateNodeProperties` mechanics before re-invoking. Bounded by `maxRetriesPerNode` (counted per `(nodeId, invocationKey)`).
- **substitute** — outputs are validated against the node's declared output `TypeMetadata` (same check `graph.validate()` applies to edges). Invalid → the handle returns a tool error to the agent and awaits a new verdict; after `MAX_REPAIR_ROUNDS` (3) → `fail`. Valid → emitted through the normal `sendOutputs` path with the invocation's lineage, so correlation downstream is indistinguishable from a real emit.
- **skip** — the actor returns without emitting. The kernel already interprets "received nothing on any input" downstream as an untaken branch, so pruning is free. The skip is recorded in `interventions` unconditionally — the audit is the feature (PRD scenario 3).
- **fail** — rethrow; identical to today.

### 5.3 Money guard

The handle — not the agent's judgment — enforces the retry-withholding rule: if `spentCostUsd > 0 || createdAssets`, the `retry` arm is removed from the verdict schema sent to the agent, so a double-charge verdict is unrepresentable rather than merely discouraged. Both fields come from `ProcessingContext`'s existing cost/asset tracking, scoped to the invocation.

### 5.4 Streaming nodes

For `is_streaming_output` nodes the coherent verdict set depends on whether anything was emitted (PRD scenario 6):

| State | Allowed verdicts |
|---|---|
| threw before first emit | retry · substitute · skip · fail |
| threw after emitting | `end-stream` (close slots, keep what was emitted) · fail |

`end-stream` is surfaced to the agent as `skip` with the schema description adjusted; the actor maps it to completing the node's output slots instead of suppressing them. Mid-stream `retry`/`substitute` are excluded from the schema for the same reason as the money guard: unrepresentable beats forbidden.

### 5.5 Cancellation and timeouts

`escalate` races three things: the verdict, the run's `AbortSignal`, and a decision timeout (default 60s). Abort or timeout → `fail`. This is what keeps `cancel()` instant (PRD scenario 8): a pending decision is abandoned, never awaited.

## 6. The supervisor agent

`packages/agents/src/supervisor/supervisor-agent.ts` implements `SupervisorHandle`:

- **One `StepExecutor` per decision**, `outputSchema` = the verdict JSON schema (narrowed per §5.3/§5.4), `maxIterations` small (6). `finish_step`'s existing validate-or-bounce loop is the repair loop for malformed verdicts — no new machinery.
- **Two tools**, both read-only, backed by state the runner already holds: `get_run_state()` (per-node status, error counts, cost — the digest) and `read_node_output(nodeId)` (last emitted values, truncated to `MAX_TOOL_RESULT_CHARS`). Progressive disclosure, same pattern as `memory_read`.
- **Serialized queue.** One decision at a time. Consecutive failures are usually related; the agent sees them in order, and a sticky verdict drains the queue for free. Head-of-line cost is bounded by the decision timeout.
- **Bounds.** `maxDecisions` (default 10) and `maxRetriesPerNode` (default 2) live in the handle. At the boundary the handle stops calling the agent and returns `fail` with `decidedBy: "bounds"` — degradation is deterministic, not a cheaper model.
- **System prompt** carries the verb semantics from the PRD, including skip-distrust and the itemization duty. It is a preamble over the standard execution contract, per the established `StepExecutor` rule.

Decisions and their one-line rationales are also written to `context.memory` under `supervisor:` keys so a downstream `CompilerAgent` (in the workflows-as-agents path) can reference them in its synthesis.

## 7. Entry points

1. **`WorkflowRunnerOptions.supervisor`** — the primitive. Used directly by tests and the debug harness.
2. **CLI** — `nodetool run --supervise [--max-decisions N] [--max-retries N] [--supervisor-model id]` and the same flags on `nodetool debug`. Interventions print inline (`⛨` lines) and appear in `--json` reports.
3. **`Agent({ graph })`** — a fourth branch in `Agent._executeImpl` alongside `executeScriptPlan`/`executeGraphPlan`: hydrate the graph, start a `WorkflowRunner` with itself as supervisor, forward the runner's message stream, return run outputs from `getResults()`. No planning phase — the graph is the plan.
4. **API/web** — `supervise: true` on the run request; the websocket runner constructs the handle and forwards `supervisor_*` messages to the client for the intervention feed. Trigger-initiated runs default it on (PRD §6.1); the flag rides the trigger row.

## 8. Replay

`supervisor_decision` messages carry everything the decision consumed (the escalation, the digest snapshot hash, the verdict). A `ReplayHandle` implementing `SupervisorHandle` resolves escalations from a recorded run's decision list, matching on `(nodeId, invocationKey, attempt)`; a miss falls through to `fail`. This is a consumer of the intervention record, not a new capture pipeline — deferred to the eval-suite PR, where it doubles as the deterministic test double.

## 9. Alternatives considered

- **Compile the graph to a `TaskPlan` and run it on `ParallelTaskExecutor`.** Rejected: `Step.dependsOn` cannot express correlation lineage, streaming, control edges, or per-handle EOS. The kernel is the better scheduler; supervise it instead of replacing it.
- **Per-node `SupervisionPolicy` struct** (onError/retries/checkpoint/budget). Rejected: everything in it except retry counts is better expressed as graph structure (Assert nodes, branches), where users can see and edit it. Retry counts became a single run-level bound.
- **A run ledger / observation pipeline.** Rejected: the runner already holds run state in memory; two pull tools replace a push pipeline. Waking the agent on checkpoints was cut with it — a clean run must cost zero.
- **Whole-run suspend (`WorkflowSuspendedError`) as the intervention mechanism.** Rejected for this purpose: it tears down in-flight actors. `escalate` parks one invocation while the rest of the DAG proceeds. Suspend remains what it is — a deliberate pause for triggers and human waits.
- **Cross-node repair** ("retry the producer with a better prompt"). Rejected: needs a control channel from supervisor to arbitrary nodes, reopening most of the complexity this design removed. Expressible as a graph loop where wanted.

## 10. Open questions

1. **Failure signatures for stickiness.** v1 sticks verdicts per node. Sticking per `(node, error-class)` would be safer for mixed failure modes on one node — worth it, or YAGNI until an eval case demands it?
2. **`inputs` truncation policy** in `Escalation` — per-value byte cap vs. schema-aware summarization. Start with the byte cap (`MAX_TOOL_RESULT_CHARS` sibling), revisit if verdict quality suffers.
3. **Provider-level backoff audit.** PRD scenario 1 assumes transient retry exists below the hook. Audit `packages/runtime/src/providers/` retry behavior in PR 1; if absent for a provider, that gap is fixed in the runtime layer, not compensated for in the supervisor prompt.
