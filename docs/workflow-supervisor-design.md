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
NodeActor applies the verdict (after checking it against the kernel-computed allowed set):
  retry      → call process() again, identical inputs and properties
  substitute → runtime value validation, then emit
  skip       → lineage_done + scope closure per slot, key pruned downstream
  end_stream → keep emitted values, close output slots
  fail       → today's error path
```

The kernel package defines the `SupervisorHandle` interface and ships a no-op default; the LLM-backed implementation lives in `@nodetool-ai/agents`. The dependency arrow stays `kernel ← agents`, unchanged.

## 4. Types

In `@nodetool-ai/protocol` (they cross the kernel/agents boundary and appear in messages):

```ts
export type VerdictAction = "retry" | "substitute" | "skip" | "end_stream" | "fail";

export interface Escalation {
  nodeId: string;
  correlationLineage: string[];    // full lineage chain of the failing invocation
  invocationKey: string;           // leaf token of correlationLineage; "" for single-fire nodes
  allowedActions: VerdictAction[]; // kernel-computed (§5.3/§5.4); schema and enforcement both derive from it
  nodeType: string;
  detail: string;                  // the thrown error, stringified
  failureSignature?: string;       // stable categorical code; absent ⇒ stickiness disabled
  candidateOutput?: unknown;       // from RecoverableNodeError — the malformed value, redacted+truncated
  inputs: Record<string, unknown>; // the invocation's input values, redacted+truncated
  declaredOutputs: Record<string, string>; // the node's declared output types, per slot
  attempt: number;                 // 1-based, per (nodeId, invocationKey)
  spentCostUsd: number;            // provider cost recorded by this invocation
  createdAssets: boolean;
  retrySafe: boolean;              // node metadata opt-in; unknown ⇒ false ⇒ no retry
  emitted: boolean;                // streaming: the invocation already sent something downstream (§5.4)
}

export type Verdict =
  | { action: "retry" }                                        // no property overrides in v1
  | { action: "substitute"; outputs: Record<string, unknown> }
  | { action: "skip"; applyTo?: "invocation" | "signature" }   // default "invocation"
  | { action: "end_stream" }                                   // streaming only: keep emitted, close slots
  | { action: "fail"; reason?: string; applyTo?: "invocation" | "signature" };
```

`retry` deliberately carries **no property overrides**. A free-form `Record<string, unknown>` would let the supervisor rewrite URLs, prompts, code, or paths — a nominally read-only HTTP node could be redirected to exfiltrate its inputs — and it wouldn't even work reliably: `updateNodeProperties` mutates the executor, but the next invocation reassigns edge-driven inputs over it. If re-parameterized retry earns its way back, it will be via explicitly declared, typed `retryMutable` properties applied to a local invocation copy (§10); v1 retries the invocation exactly as it was.

`end_stream` is a first-class verdict, not a `skip` alias: the actor must distinguish "keep what was emitted and close the slots" from "drop this invocation's outputs," and one action cannot encode both. In the product surface it is **presented under Skip** — "skipped the rest of this step, kept what it had produced" — so the PRD's four user verbs hold while the kernel action stays distinct; the intervention record always carries the real action.

`fail.reason` is not decoration: when a supervised run ends in `fail`, the runner surfaces `reason` as the job's user-facing error summary (the PRD's "one-sentence reason written by the agent") while the original thrown error is preserved in the intervention record and node error detail. The pseudocode's rethrow carries the original error; the runner attaches the reason at job-status level.

`applyTo: "signature"` is the sticky form: the handle caches the verdict keyed by `(nodeId, failureSignature)` and resolves later escalations that match without waking the agent (PRD scenario 2 — 7 identical failures, 1 LLM call). Keying by signature rather than node keeps one login-required error from silently skipping later, unrelated timeouts on the same node. A signature exists only when the error carries a **stable categorical code** — HTTP status, provider error code, validation path — extracted by a small registry of error-shape recognizers. A plain `Error` gets **no** signature (error class alone is not one; every generic throw would collide), and with no signature stickiness is simply off: each such failure escalates individually. Signatures never derive from message text with embedded values. Only `skip` and `fail` may stick; a sticky `retry` or `substitute` would blindly replay a decision made against different inputs.

`declaredOutputs` is what makes `substitute` authorable at all: a repair has to
be typed per slot, and the escalation is the only thing the supervisor sees.
It is also what the agent-side acceptance hook validates against before the
verdict is allowed to become terminal, so the model learns its repair was the
wrong shape while its conversation is still open. Type metadata, so nothing to
redact.

`RecoverableNodeError` (node-sdk) is how a node hands the supervisor the thing that needs repairing: a parser that throws on broken JSON attaches the raw response as `candidateOutput` instead of losing it. **No `candidateOutput`, no `substitute`** — without the broken value in hand, "repair" is fabrication: the model would invent a structurally valid output the runtime validator cannot semantically vet. A plain thrown error offers retry/skip/fail only.

New `ProcessingMessage` variants: `supervisor_escalation` and `supervisor_decision` (escalation + verdict + `decidedBy: "agent" | "sticky" | "bounds" | "default"` + cost). Both flow through the existing `_emit` path.

`RunResult` gains:

```ts
interventions?: Array<{ escalation: Escalation; verdict: Verdict; decidedBy: string }>;
```

Status stays the existing enum. "Completed — supervised" is `status: "completed"` with a non-empty `interventions` — a derived display state, not a fifth status, so every existing consumer of `status` keeps working.

## 5. The kernel hook

### 5.1 Where it sits

`WorkflowRunner` takes the handle as an option and hands it to each `NodeActor`, alongside the callback that records interventions. The handle stays in the kernel rather than on `ProcessingContext`: node code has no business raising or answering escalations, and the actor already holds everything the escalation constructor needs. What the context *does* gain is the resolved-secret registry the constructor masks against (§6.1) and per-invocation cost/asset accounting (§5.3).

```ts
export interface WorkflowRunnerOptions {
  // ...existing
  supervisor?: SupervisorHandle;
}

export interface SupervisorHandle {
  decide(e: Escalation, signal: AbortSignal): Promise<DecisionOutcome>;
  close(): void;
}

/** The verdict, who made it, and what it cost — the intervention record minus its escalation. */
export interface DecisionOutcome {
  verdict: Verdict;
  decidedBy: "agent" | "sticky" | "bounds" | "default";
  costUsd?: number;
}
```

`NodeActor` wraps each invocation's execution. Pseudocode for the buffered/correlated path (`_executeWithInputs`):

```ts
const allowed = this.allowedActions(node, invocation);          // kernel-computed, §5.3/§5.4
let result;
for (;;) {
  try {
    result = await this.invoke(inputs);                         // node execution ONLY
    break;
  } catch (err) {
    if (err instanceof WorkflowSuspendedError) throw err;       // suspend is not failure
    let verdict = await this.escalateOrFail(err, inputs, allowed);
    if (!allowed.has(verdict.action)) verdict = { action: "fail" };  // kernel enforces, always
    switch (verdict.action) {
      case "retry":      continue;                              // same inputs, same properties
      case "substitute": result = this.validated(verdict.outputs); break;
      case "skip":       this.dropOutputs(); return;            // lineage_done + scope closure
      case "end_stream": this.completeSlots(); return;
      case "fail":       throw err;
    }
    break;
  }
}
this.sendOutputs(result);   // routing is OUTSIDE the recovery loop — see below
```

Two boundaries here are load-bearing:

- **The kernel computes and enforces `allowed`.** Schema narrowing (§5.3, §5.4) shapes what the *agent* can express, but the actor independently rejects any verdict outside the allowed set — a buggy or third-party `SupervisorHandle` returning `retry` for an unsafe node, or `substitute` for an unsupported output, gets `fail`. The allowed set travels as `Escalation.allowedActions` so both layers derive from one computation. Defense in depth: the schema is UX, the kernel check is the guarantee.
- **Only node execution is recoverable.** `sendOutputs` routes values to downstream inboxes sequentially; if edge 1 delivered and edge 2 throws, a retry would duplicate edge 1's delivery. Routing failures therefore fail the node without escalation — the catch wraps `invoke()`, never the send.

Retry is a plain loop re-entry: the invocation's inputs are still in scope, so nothing is reconstructed and no scheduler state is touched. The same wrapper applies to the controlled path (`_runControlled`, per control event) and to input dispatch.

### 5.2 What each verdict means to the kernel

- **retry** — re-invoke with the identical inputs and properties (no overrides, §4). Bounded by `maxRetriesPerNode` (counted per `(nodeId, invocationKey)`).
- **substitute** — offered only when the escalation carries a `candidateOutput` (§4) and every declared output type has a validator rule. Outputs pass a **runtime value validator**, not a `TypeMetadata` compatibility check: `graph.validate()` compares declared edge types and the existing runtime accepts any object for custom types, so type-compatibility would wave through a fabricated `{type:"image"}` blob. The validator checks actual values per declared output type: primitives and enums strictly, lists/objects structurally, and reference types (`ImageRef`, `AudioRef`, …) as well-formed refs whose `uri`/asset id **resolves** against the run's storage.

  Resolution is asynchronous, which constrains *where* validation runs: it cannot happen after `decide()` returns, because the `StepExecutor` conversation is over and there is nobody left to bounce an error to — and `finish_step`'s built-in loop only covers synchronous JSON-schema checks. So the verdict tool's acceptance is an **async hook**: when the agent calls `finish_step` with a `substitute`, the handle awaits the full runtime validation (storage resolution included) *before* the call is accepted as terminal; a failure returns as an ordinary tool error and the conversation continues. After `MAX_REPAIR_ROUNDS` (3) → `fail`. Valid → emitted through the normal `sendOutputs` path with the invocation's lineage, so correlation downstream is indistinguishable from a real emit.
- **skip** — the actor does **not** simply return. For a correlated invocation, plain non-emission leaves siblings buffered against the skipped key at downstream joins — the kernel grew per-lineage `lineage_done` signaling precisely because global EOS can't express this. `NodeOutputs.drop(slot, envelope)` covers that half. It does **not** cover the other half: `drop()` emits only `lineage_done`, and a skipped invocation of an iteration node would have *opened child scopes* that an aggregate downstream is waiting to see closed. Skip therefore needs new kernel plumbing — per-parent `lineage_scope_closed` emission for the scopes the invocation would have created (the signaling primitive exists in `NodeInbox`; what's new is the actor-side emission path). The iterator-feeding-an-aggregate case is a named PR 1 test. The skip is recorded in `interventions` unconditionally — the audit is the feature (PRD scenario 3).
- **fail** — rethrow; identical to today.

### 5.3 Retry safety

The handle — not the agent's judgment — decides whether `retry` appears in the verdict schema at all, so an unsafe retry is unrepresentable rather than merely discouraged. `retry` is offered only when **all** hold:

1. `retrySafe === true` — the node **opts in** via node metadata (node-sdk);
2. `spentCostUsd === 0` — no provider cost recorded by this invocation;
3. `createdAssets === false` — no asset writes.

(1) is an opt-in, not an opt-out, because the failure mode is asymmetric. An unset flag on a custom node, a legacy package, a nested `WorkflowNode` (whose inner graph can contain anything), or an overlooked write node must not *gain* retry by omission — cost tracking cannot see external writes (`Publish`, `Upsert`, `Notify`, payment-shaped nodes can complete their side effect and *then* throw, recording nothing). So unknown defaults to unsafe: a node nobody classified loses a safe retry (annoying, visible, fixable with one flag) rather than gaining an unsafe one (silent duplicate effects). PR 1 declares `retrySafe` across the pure-compute and read-only node categories in the shipped packages; `WorkflowNode`/`SubgraphNode` are never retry-safe in v1. A side-effecting node can re-earn retry later via an idempotency key — out of scope, noted in §10.

(2) and (3) require **invocation-scoped** tracking, and it cannot be a stack on the shared context: every actor holds the same `ProcessingContext` and actors complete out of order, so push/pop attribution would credit actor A's cost to actor B whenever A finishes first — exactly the corruption that would re-expose retry after a billed call. The scope must travel with the invocation's async execution: `AsyncLocalStorage` around `invoke()`, or an explicit per-invocation accounting object threaded through the provider/asset call paths. PR 2 builds it either way, and reverse-order completion of concurrent invocations is a named test.

### 5.4 Streaming nodes

Streaming breaks the "inputs still in hand, just re-invoke" premise in two distinct ways.

**Streaming output** (`is_streaming_output`, `genProcess`): the coherent verdict set depends on whether anything was emitted (PRD scenario 6):

| State | Allowed verdicts |
|---|---|
| threw before first emit | retry* · skip · fail |
| threw after emitting | `end_stream` (close slots, keep what was emitted) · fail |

No `substitute` in either state — the PRD's rule ("Repair never" for streams) holds: there is no single invocation value for a substitution to stand in for.

**Streaming input** (`is_streaming_input`, `run()` nodes): the node drains its inbox itself and may have consumed messages long before throwing — so even "threw before first emit" does not mean the invocation is replayable. Worse, a `run()` failure has no single invocation lineage: consumed-but-unresolved envelopes span arbitrary lineages, so there is nothing coherent for `skip`'s `drop()` to target either. In v1 the verdict set for `run()` nodes is `end_stream` · `fail` — nothing else is representable without a kernel-level input replay buffer or per-envelope lineage retention, both explicitly out of scope (§10).

*retry additionally requires §5.3's conditions, as everywhere.

Excluded verdicts are removed from the agent's schema **and** from the kernel's allowed set (§5.1) — the schema is UX, the allowed set is the guarantee.

### 5.4a Content-filter refusals in an unsupervised run

One failure class degrades without a supervisor: a provider content filter
refusing to generate. Veo 3.1 filtered one shot of a five-shot trailer on an
ordinary cinematic shot description, the same prompt passed on retry, and the
blocked take was not charged — so the refusal is non-deterministic and
provider-side, not a defect in the request.

It is answered at two levels. `ProcessingContext.runProviderPrediction` retries
a refusal `CONTENT_FILTER_MAX_RETRIES` times with backoff, so most never reach
the node. One that survives reaches the actor as a `ContentFilterRefusal`
(`@nodetool-ai/runtime`), and the actor takes the `skip` path — retiring that
invocation's lineage, exactly as the verdict does — when the invocation is one
item of a fan-out and nothing has been emitted yet. Everything else still
fails: a single-shot invocation has no siblings whose spend a failure would
discard, and an emitted stream has partial output downstream that a retired
lineage would contradict.

A **supervised** run is unchanged. The refusal escalates like any other
failure, because putting an agent on the failure path is what `--supervise` is
for; `skip` is already in its allowed set (§5.4).

### 5.5 Cancellation and timeouts

Each `decide()` call gets its own `AbortSignal`, derived from the run's signal plus a decision timeout (default 60s). The signal is not decoration around the `await`: it threads through `StepExecutor` into `provider.generateLoop({signal})`, so abort actually terminates the in-flight LLM request rather than orphaning it to keep consuming tokens after `cancel()`. Abort or timeout → `fail`. This is what keeps `cancel()` instant *and* free (PRD scenario 8): a pending decision is killed, not merely un-awaited.

## 6. The supervisor agent

`packages/agents/src/supervisor/supervisor-agent.ts` implements `SupervisorHandle`:

- **One `StepExecutor` per decision**, `outputSchema` = the verdict JSON schema (narrowed to `allowedActions`), `maxIterations` small (6). This *does* require extending `StepExecutor`: its current `finish_step` validation checks only top-level type and required keys — no enums, nested fields, `additionalProperties`, or discriminated unions, which a verdict schema needs — and its acceptance closure is private and synchronous, while substitute acceptance must await storage resolution (§5.2). PR 3 adds a full host-side JSON-schema validator and an injectable **async acceptance callback** to `StepExecutor` proper (both generally useful, neither supervisor-specific).
- **Two tools**, both read-only, backed by state the runner already holds: `get_run_state()` (per-node status, error counts, cost — the digest) and `read_node_output(nodeId)` — **scoped to the failed invocation's causal lineage**. In a fan-out, "last emitted value" may belong to a different item; an unscoped read hands the agent another item's output as repair material (a poisoned repair) and quietly widens the data shared with the model beyond the failing item. The tool resolves through `Escalation.correlationLineage` and refuses reads outside it. Progressive disclosure, same pattern as `read_shared`.
- **Serialized queue.** One decision at a time. Consecutive failures are usually related; the agent sees them in order, and a sticky verdict drains the queue for free. Head-of-line cost is bounded by the decision timeout.
- **Bounds.** `maxDecisions` (default 10), `maxRetriesPerNode` (default 2), and `maxSupervisorCostUsd` (default $0.50). Decisions and retries alone do not cap dollars, and checking *spent* cost before a call doesn't either — the next call's cost is only known afterward, so $0.49 spent could admit a $0.30 call and land at $0.79. The ceiling is enforced by **reservation**: worst-case cost (input tokens × input price + max output tokens × output price, from the model-pricing catalog), admitted only if `spent + reserved ≤ cap`, committed to actuals afterward. Two consequences the plumbing must respect. First, the interception point must sit **inside the provider layer, not around it**: a wrapper around `generateLoop()` sees one call while the base provider makes its turns internally, and the Claude Agent SDK provider overrides the whole loop — so neither a kernel-side check at `decide()` granularity nor an outer wrapper can reserve per turn. The mechanism is a runtime-level **budget object** (`TurnBudget`: `reserve(estimate) → admit | reject`, `commit(actual)`) accepted by `generateLoop` options and honored before every model turn by the base loop *and* by native loop overrides — an explicit contract obligation on providers that own their loop. Decision/retry counting stays in the kernel's `BoundedHandle` (PR 2); the budget object is constructed by the supervisor handle and threaded per decision (PR 3, with the runtime change). Second, reservation needs a *known* output bound, so the supervisor sets an explicit `supervisorMaxOutputTokens` (default 2048) on every call — `StepExecutor.maxTokens` being optional is not good enough here. A model with no usable pricing entry fails closed — the supervisor won't run on it. At any boundary the handle stops calling the agent and returns `fail` with `decidedBy: "bounds"` — degradation is deterministic, not a cheaper model.
- **System prompt** carries the verb semantics from the PRD, including skip-distrust and the itemization duty. It is a preamble over the standard execution contract, per the established `StepExecutor` rule.

Decisions and their one-line rationales are also written to `context.memory` under `supervisor:` keys so a downstream `CompilerAgent` (in the workflows-as-agents path) can reference them in its synthesis.

### 6.1 What the supervisor model sees

Escalations carry node inputs, error text, and (via `read_node_output`) prior outputs — real user data, sent to whichever model supervises. Truncation is not redaction; the boundary is explicit:

- **Redaction at construction, not at the prompt.** `Escalation` is a *public record*: it becomes a `supervisor_escalation` message, lands in `RunResult.interventions`, and crosses the websocket — all before any agent exists. So the redaction layer lives in the **kernel** and runs when the escalation is built (PR 1, the same PR that mints the type): the actor hands raw error + inputs to a constructor that masks secret values wherever they appear (headers, URLs, bodies) and drops fields matching the sensitive-name list (`password`, `token`, `authorization`, …). Raw values never leave the actor's stack frame; there is no unredacted `Escalation` anywhere in the system to leak. The agent-side handle applies the same layer to tool results (`read_node_output`), the one supervisor input not derived from an `Escalation`.

  Masking "every secret-store value" presupposes knowing which values are secrets, and today's `ProcessingContext` doesn't: it resolves one secret by key and forgets. So redaction has a prerequisite deliverable — a **resolved-secret registry** on the context that records every value handed out by the secret resolver for the run's lifetime, which the escalation constructor masks against. PR 1 builds it alongside the constructor; without it the masking promise is empty.
- **Provider policy.** The supervisor model must be restricted to providers the workspace approves — and this, too, is infrastructure that does not exist yet: current allow-listing is global cloud-node pruning and frontend filtering, with no runtime enforcement per workspace. A **workspace provider allow-list** (schema + API + a runtime check in provider resolution) is a concrete deliverable on the path to default-on, not an assumed property. Until it ships, the supervisor honors the existing global restrictions only, and the gate treats the allow-list as unmet.
- **Consent.** Enabling supervision *is* the consent act, and the toggle's help text says what will be shared, with which model, when. Consent is per-trigger and forward-looking only: existing triggers are **never silently migrated** when the default flips — the new default applies to newly created triggers, and existing ones surface a one-time prompt instead. This is why default-on is gated (§ plan PR 8): defaults must not expand data flow before the boundary above has shipped and been evaluated.

## 7. Entry points

Surfaces do not construct `WorkflowRunner` directly anymore — CLI, debug, headless, and websocket execution all go through the `ExecutionSession` facade (`packages/execution`), with a handful of grandfathered direct-construction sites. Supervision therefore plumbs through the facade: **`ExecutionSessionOptions.supervisor`** is the one integration point every surface shares, and it forwards to `WorkflowRunnerOptions.supervisor` internally. Wiring the surfaces around the facade would either reintroduce direct construction or make supervision behave differently per surface — both are non-goals.

1. **`WorkflowRunnerOptions.supervisor`** — the kernel primitive. Used directly only by kernel tests and by `ExecutionSession` itself.
2. **CLI** — `nodetool run --supervise [--max-decisions N] [--max-retries N] [--supervisor-cost-cap USD] [--supervisor-model id]` and the same flags on `nodetool debug`. Interventions print inline (`⛨` lines) and appear in `--json` reports.
3. **`Agent({ graph })`** — a fourth branch in `Agent._executeImpl` alongside `executeScriptPlan`/`executeGraphPlan`: hydrate the graph, start a `WorkflowRunner` with itself as supervisor, forward the runner's message stream, return run outputs from `getResults()`. No planning phase — the graph is the plan.
4. **API/web** — `supervise: true` on the run request; the websocket runner constructs the handle and forwards `supervisor_*` messages to the client for the intervention feed. Trigger rows carry the flag, **off by default** until the plan's PR 8 gate passes; the eventual flip covers newly created triggers only (§6.1 consent).
5. **Interactive (agent tools)** — `interactive: true` on `POST /api/workflows/:id/run|debug` makes the *calling* agent the supervisor: `InteractiveEscalationHandle` (`packages/execution/src/service/debug-sessions.ts`) parks each `decide()` until a verdict arrives on `POST /api/debug/sessions/:id/verdict`, and the escalated HTTP response carries the `Escalation` record itself. The agent-facing `run_workflow`/`debug_workflow` tools expose the flag and `resolve_workflow_escalation` answers; the handle is wrapped in the same `BoundedHandle` (caps, sticky verdicts, a timeout sized for a tool round trip — 10 min — that fails closed), and the kernel still enforces `allowedActions` whatever arrives.

## 8. Replay

`supervisor_decision` messages carry everything the decision consumed (the escalation, the digest snapshot hash, the verdict). A `ReplayHandle` implementing `SupervisorHandle` resolves escalations from a recorded run's decision list, matching on `(nodeId, invocationKey, attempt)`; a miss falls through to `fail`. This is a consumer of the intervention record, not a new capture pipeline — deferred to the eval-suite PR, where it doubles as the deterministic test double.

## 9. Alternatives considered

- **Compile the graph to a `TaskPlan` and run it on `ParallelTaskExecutor`.** Rejected: `Step.dependsOn` cannot express correlation lineage, streaming, control edges, or per-handle EOS. The kernel is the better scheduler; supervise it instead of replacing it.
- **Per-node `SupervisionPolicy` struct** (onError/retries/checkpoint/budget). Rejected: everything in it except retry counts is better expressed as graph structure (Assert nodes, branches), where users can see and edit it. Retry counts became a single run-level bound.
- **A run ledger / observation pipeline.** Rejected: the runner already holds run state in memory; two pull tools replace a push pipeline. Waking the agent on checkpoints was cut with it — a clean run must cost zero.
- **Whole-run suspend (`WorkflowSuspendedError`) as the intervention mechanism.** Rejected for this purpose: it tears down in-flight actors. `escalate` parks one invocation while the rest of the DAG proceeds. Suspend remains what it is — a deliberate pause for triggers and human waits.
- **Cross-node repair** ("retry the producer with a better prompt"). Rejected: needs a control channel from supervisor to arbitrary nodes, reopening most of the complexity this design removed. Expressible as a graph loop where wanted.

## 10. Open questions

1. **`inputs` truncation policy** in `Escalation` — per-value byte cap vs. schema-aware summarization. Start with the byte cap (`MAX_TOOL_RESULT_CHARS` sibling), revisit if verdict quality suffers. (Redaction per §6.1 happens regardless; this question is only about size.)
2. **Provider-level backoff audit.** PRD scenario 1 assumes transient retry exists below the hook. Audit `packages/runtime/src/providers/` retry behavior in PR 1; if absent for a provider, that gap is fixed in the runtime layer, not compensated for in the supervisor prompt.
3. **Idempotency keys for side-effecting nodes.** §5.3 gates retry on an explicit `retrySafe` opt-in. A side-effecting node that accepts an idempotency key could safely re-earn it. Deferred until a real node needs it.
4. **Input replay buffer for `run()` nodes.** §5.4 leaves streaming-input nodes with only `end_stream` · `fail` because consumed inbox messages are gone and no single lineage exists to drop. A bounded replay buffer (or per-envelope lineage retention) would re-earn retry and skip; kernel-level work, deferred until an eval case shows it matters.
5. **Typed `retryMutable` properties.** §4 removes property overrides from retry entirely. If re-parameterized retry proves necessary, the path is node-declared, typed `retryMutable` properties applied to a local invocation copy — never a free-form record, never `updateNodeProperties`.
