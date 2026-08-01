# PRD: Workflow Supervisor

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-08-01
**Design doc:** [workflow-supervisor-design.md](workflow-supervisor-design.md)
**Implementation plan:** [workflow-supervisor-implementation-plan.md](workflow-supervisor-implementation-plan.md)

---

## 1. Summary

A NodeTool workflow is deterministic: the graph says what happens, in what order, with what data. That is its strength — and the reason a single flaky HTTP call at 3am kills a 200-item pipeline that was 97% done.

The Workflow Supervisor gives a run a safety net. When a node fails after its own retries are spent, the run doesn't die: an agent wakes up, looks at what the node was doing, and makes one of four calls — **Retry**, **Repair**, **Skip**, or **Stop**. Then it goes back to sleep. On a clean run the supervisor costs nothing: zero LLM calls, zero latency, zero dollars.

The user-facing promise is one sentence: **your workflow runs like it always did, but a failure becomes a decision instead of a funeral.**

This is also what makes a workflow behave like an agent. An agent improvises its steps; a supervised workflow keeps its deterministic steps and borrows only the part of agency that's actually valuable — judgment at the moment something breaks.

---

## 2. Problem

### 2.1 Failures are total

Today one node error fails the whole job (`RunResult.status = "failed"`). The kernel's `suspended` state is a different animal — a deliberate pause for triggers and human waits, not failure handling. For failures there is no middle ground between "everything worked" and "you get nothing":

- A 200-URL content pipeline dies on URL #147. The 146 finished summaries are in the message log, but the run is `failed`, the CSV never writes, and the user's mental model is "it broke."
- An overnight image batch fails on one malformed provider response after $6 of successful generations.
- A nightly ingest dies mid-run; nobody sees it until someone notices the vector store is stale two days later.

### 2.2 The existing answers don't fit

- **Agent mode** (`AgentNode`, plan mode) replaces determinism with planning. Users who drew a graph did so because they want *these* steps, not whatever a planner invents tonight.
- **Manual babysitting** works only when someone is watching. The whole point of long and scheduled runs is that no one is.
- **Defensive graph-building** (try/catch subgraphs, fallback branches everywhere) is possible today and nobody does it, because it triples the graph size to handle failures that occur on 2% of runs.

### 2.3 Why now

Triggers ([triggers-prd.md](triggers-prd.md)) turn workflows into things that run while the user sleeps. Unattended runs make failure handling the difference between an automation and a liability. The shared constraint from that PRD applies verbatim here: *a broken automation that silently spends money is worse than no automation.* The supervisor must be safe before it is clever.

---

## 3. Users

Same population as triggers: **solo freelancers** and **small agencies**. What they add to the picture:

- They are not on-call. A failure at 3am must resolve itself or wait politely until morning — never spend unboundedly trying.
- They don't read logs. Whatever the supervisor did must be legible in one glance from the run page or a notification.
- They trust the graph. Anything the supervisor changes about an execution must be visibly marked, or trust in every green checkmark evaporates.

---

## 4. Use cases

Ten failure scenarios were reasoned through against three reference workflows; these shaped the requirements below.

### 4.1 Reference workflows

| # | Workflow | What it exercises |
|---|---|---|
| A | 200 URLs → Fetch → Extract → Summarize → Collect → CSV | fan-out, cheap items, unattended, cost per item ≈ nothing |
| B | Prompt → Enhance → Image gen ($) → Quality check → Upscale ($) → Publish | expensive sequential steps, quality gates, retries cost real money |
| C | Nightly: List docs → Chunk (streaming) → Embed → Upsert → Notify | streaming, external side effects, nobody watching |

### 4.2 Scenarios and what they demand

| # | Scenario | Requirement it produced |
|---|---|---|
| 1 | Transient 429 mid-batch (A) | Provider-level backoff handles this *below* the supervisor. The supervisor wakes only when a node's own error handling is exhausted. |
| 2 | 7 of 200 items fail the same way (A) | One decision, applied to the rest. First failure wakes the agent; its verdict can stick for *matching failures* on that node (same error signature), so failures 2–7 resolve instantly and free — while a different error on the same node still gets its own decision. |
| 3 | Skipped items vanish silently (A) | Skips are always audited. The run ends **"Completed — supervised"**, never plain "Completed", and the report says exactly what was skipped. |
| 4 | Repair produces a wrongly-shaped value (B) | Repaired values are type-checked against the node's declared outputs before entering the graph; invalid repairs bounce back to the agent. |
| 5 | Retry after money was spent or an external write happened (B, C) | Retry exists only for steps **known safe to redo**: the node type opts in, and the failed attempt recorded no cost and wrote no asset. A step nobody classified gets no retry — external writers (publish, upsert, notify) can complete their side effect and then fail without recording anything, so "unknown" must mean "unsafe." The agent can't double-charge or double-post. |
| 6 | Streaming node fails mid-stream (C) | Retry only if nothing was emitted yet; Repair never. Otherwise the choice is Stop or end-the-stream. |
| 7 | One bad repair cascades downstream (A) | Decisions carry lineage. The report shows one cause, not twelve symptoms, and attributes downstream failures to the verdict that caused them. |
| 8 | The supervisor itself hangs or dies | Escalation has a timeout and honors Cancel. Any supervisor failure resolves as Stop. Cancel always works, instantly. |
| 9 | Tuesday's run behaves differently from Monday's (C) | Any run where a verdict fired is marked supervised in the run record. Deterministic runs stay visibly deterministic. |
| 10 | Quality gate fails, root cause is upstream (B) | An Assert node's value can be repaired in place (it's a pass-through). "Re-run the producer with a better prompt" is out of scope — expressible as a graph loop, not a supervisor power. |

---

## 5. Product principles

1. **Silent on success.** A clean run with supervision on is byte-for-byte the run you'd get with it off, at zero added cost. The supervisor is a smoke detector, not a co-pilot.
2. **Four verbs, user words.** Retry, Repair, Skip, Stop. No configuration matrix, no policy DSL. If a behavior can't be explained in one of these four words, it doesn't ship.
3. **Never silent, never sneaky.** Every intervention is visible in the run status, on the node, and in the report. "Completed — supervised" is a distinct state the user learns to read in a week.
4. **Money is sacred.** The supervisor can never cause a second charge or a duplicate external write for work already done, and its own spending sits under a hard dollar cap the user can see.
5. **The graph is the policy.** Want a quality bar? Add an Assert node. Want a fallback? Draw the branch. The supervisor handles the failures you *didn't* plan for; the ones you can foresee belong in the graph where they're visible and editable.

---

## 6. User experience

### 6.1 Turning it on

One toggle, next to the Run button: **Supervisor**. The end state: on by default for triggered (unattended) runs, off by default for interactive runs — when you're watching, you *are* the supervisor. Until the evaluation and data-safety gates pass (§10 phase 4), it ships off by default everywhere — and when the default flips, it applies to newly created triggers only; existing triggers are never switched on silently.

Turning it on is also a data decision: failure context — the failing step's inputs and error, and, if the agent digs deeper, earlier outputs belonging to the same failing item — is sent to the supervisor model, with secrets masked. The toggle's help text says so in one sentence.

Expanding the toggle shows four settings:

| Setting | Default | Meaning |
|---|---|---|
| Model | workspace default | which model makes the calls |
| Max decisions | 10 | after this, remaining failures fail normally |
| Max retries per step | 2 | per failed step, across all verdicts |
| Cost cap | $0.50 | hard ceiling on the supervisor's own spending, checked before every call |

No per-node configuration. No policy editor. (Deliberately — see §9.)

### 6.2 During a run (editor)

- A failed-then-handled node shows a **shield badge** in place of the error badge, colored by verdict: retry (blue), repair (amber), skip (gray).
- While the agent is deciding, the node pulses with a "supervisor deciding…" state — distinct from "running." Typical decision time is seconds; work that doesn't depend on the failed node keeps executing (its own downstream naturally waits).
- A slim **intervention feed** appears in the run panel only when the first intervention happens: one line per decision, in plain language. *"Summarize failed on item 147 (empty response) → retried → succeeded."*
- Cancel behaves exactly as today. A pending decision is abandoned, not awaited.

### 6.3 After a run

Terminal states, in the order a user scans them:

| State | Meaning |
|---|---|
| ✅ Completed | clean run, fully deterministic, same as today |
| 🛡️ Completed — supervised | finished, but the agent intervened; the report says where |
| ❌ Failed | the agent judged it unrecoverable (Stop), or bounds were hit — with a one-sentence reason written by the agent, not a stack trace |
| ⏹️ Cancelled | as today |

The run report gets an **Interventions** section: what failed, what the agent saw, what it decided, what it cost, and — for skips — precisely which items are missing from the output ("193 of 200 URLs in the CSV; 7 skipped: …"). One click expands any decision to the raw error and the repaired value.

For triggered runs, the notification line carries the state: *"Nightly ingest: completed — supervised (2 retries, $0.03)."* A user who reads only notifications still knows everything material.

### 6.4 CLI

```bash
nodetool run workflow.json --supervise
nodetool run workflow.json --supervise --max-decisions 5
```

Interventions print inline as they happen, prefixed `⛨`:

```
⛨ fetch_url [item 147/200] failed: timeout → retry (1/2) → ok
⛨ extract [item 152/200] failed: malformed HTML → skip (verdict applies to node)
── run completed (supervised): 198/200 items, 2 skipped, 3 decisions, +$0.02 supervisor cost
```

`--json` reports include the full intervention record. `nodetool debug` gains `--supervise` so the edit→verify loop can exercise recovery paths.

### 6.5 Workflows as agents (chat and API)

An agent-facing entry point runs a workflow *as* an agent: same streaming interface, same result contract as `Agent.execute()`, no planning phase — the graph is the plan. In chat, "run my ingest workflow and deal with any hiccups" does exactly what it says, and the interventions render as the same feed cards chat already uses for agent steps.

### 6.6 The four verbs, as the user meets them

| Verb | Report line reads like | When the agent may use it |
|---|---|---|
| **Retry** | "retried → succeeded on the second attempt" | transient-looking failures, and only on steps known safe to redo — never after the step spent money or wrote anything, never on steps that weren't classified as redo-safe. The step reruns exactly as it was; the supervisor can't quietly change what it does |
| **Repair** | "provider returned broken JSON; supervisor extracted the valid fields" | only when the failing step handed over the broken value — repair fixes what exists, it never invents a plausible output from nothing; the repaired value must pass validation |
| **Skip** | "skipped item 147 (page requires login)" | the item is dispensable and the run is more valuable finished; always itemized in the report |
| **Stop** | "stopping: the API key is invalid, so all remaining items would fail" | continuing would waste money or produce garbage |

Skip is the verb the agent is instructed to distrust most: silent data loss dressed up as success is the one outcome this feature must never produce.

---

## 7. Non-goals

- **No plan changes.** The supervisor never adds, removes, or rewires nodes. The graph the user drew is the graph that runs.
- **No per-node policy configuration.** Foreseeable failure handling belongs in the graph (Assert nodes, branches), not in a settings matrix.
- **No cross-node repair.** "Retry the producer with a better prompt" is a graph loop, not a supervisor power.
- **No human-in-the-loop pauses** in v1. The existing plan-approval machinery is the natural extension point later.
- **No replacement for provider retry.** Backoff for rate limits lives in the provider layer; if it's missing there, it gets built there first.

---

## 8. Success metrics

- **Recovery rate:** ≥60% of runs that would have failed today complete (fully or supervised) with supervision on — measured by the `nodetool eval supervisor` suite (graphs with injected faults), gated in CI like the other eval suites.
- **Silence on success:** 0 LLM calls, 0 added latency on clean runs. Measured, not assumed.
- **False-wake rate:** <5% of decisions are ones a deterministic rule would have made identically (e.g. retrying an obvious transient) — the signal that layering below the supervisor is right.
- **Trust proxy:** skips per completed-supervised run trend toward itemized-and-small; a run reporting success while missing un-itemized output is a P0 bug, full stop.

---

## 9. Open questions

1. **Default-on for triggered runs** — right call, or should the first supervised recovery be opt-in with a "turn this on for future runs?" prompt after showing the user what it *would* have done (a dry-run verdict on the failed run's report)?
2. **Verdict stickiness across runs.** Scenario 2 makes verdicts stick within a run. Should a nightly trigger remember last night's verdict for the same failure signature? Powerful for cost, risky for drift.
3. **Where does the supervisor's cost land** in `nodetool costs` — attributed to the run, or broken out as a separate line?

---

## 10. Phasing

| Phase | Ships | User sees |
|---|---|---|
| 1 | Escalation hook in the kernel, fail-closed default; audited statuses | nothing changes; groundwork only, behavior-preserving |
| 2 | Supervisor agent + four verbs; CLI `--supervise`; intervention record in `--json` | CLI users get the full feature |
| 3 | Editor toggle, shield badges, intervention feed, run-report section (all opt-in) | the product surface |
| 4 | Workflows-as-agents entry point; chat integration; eval suite in CI; **then** trigger default-on, gated on the eval bar and the data-safety checklist | "run it and deal with hiccups" |
