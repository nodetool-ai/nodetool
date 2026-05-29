# Concurrent node runs & job queueing — findings & design

Status: investigation + partial implementation on branch `claude/kind-einstein-oB9Sl`
(PR #3391). This document captures the architecture as it exists today, what was
built, the feasibility of "inject a node into a running job", and the architectural
decision (separate jobs vs. one growing job) that is still open.

---

## 1. Original request

Two user-facing asks kicked this off:

1. **Don't block on one run at a time.** Previously a job had to finish before another
   could be sent; users want to fire off multiple runs without waiting.
2. **Guard against accidental huge runs.** The "Run Workflow" button executes *every*
   executable node at once (e.g. 50 nodes); add a warning before large runs.
3. **Cap concurrency + queue the overflow** so a burst of runs can't overload a
   provider/API.

Follow-ups refined the model:
- Per-node "Run From Here" should run **concurrently** (multiple single-node jobs in
  tandem), like generative nodes already do.
- The global Run button should **show the number of running jobs**.
- Constraint: **one** multi-node (full) run at a time, but **many** single-node runs.
- Open idea: instead of spawning a separate job per node, **inject the node into the
  already-running job** so it stays "one job".

---

## 2. How workflow runs work today

### 2.1 Two distinct run paths

**A. Per-workflow runner (gated, one-at-a-time):**
- `web/src/stores/WorkflowRunner.ts` — `getWorkflowRunnerStore(workflowId)` is a
  **factory keyed by workflowId** (`runnerStores` Map). Each open workflow has its own
  runner store with a single `state` and single `job_id`.
- `run()` has a **busy guard** (`WorkflowRunner.ts` ~256-276): if the runner is
  `connecting|running|paused|suspended` it ignores new runs. The Run button is
  `disabled={isWorkflowRunning}`.
- Used by: the "Run Workflow" button (`useFloatingToolbarActions.handleRun`),
  Run Selected (`useRunSelectedNodes`, which also has a sequential "run N times",
  `MAX_RUNS=32`), single-node "Recalculate" (`useRunSingleNode`), and instant-update
  (`useInputNodeAutoRun`). All of these are gated to one run per workflow.
- **Consequence:** the same workflow cannot run twice concurrently from the UI; but
  *different* workflows each have their own runner and run concurrently.

**B. Inline jobs (independent, concurrent):**
- `web/src/lib/workflow/runInlineGraphJob.ts` — generates a fresh `jobId = uuidv4()`,
  sends its **own `run_job`** over the shared websocket, and subscribes to results by
  **`job_id`** (`globalWebSocketManager.subscribe(jobId, …)`).
- Used by generative/asset nodes (sketch/timeline gen hooks). These **bypass the
  per-workflow gate** and run **in tandem** — this is the "fire off many at once"
  behavior users liked.

### 2.2 Message routing
- `web/src/lib/websocket/GlobalWebSocketManager.ts` — one shared connection
  (singleton). `routeMessage` dispatches by routing keys: **`workflow_id` and
  `job_id`** (and `thread_id`).
- The per-workflow runner subscribes by `workflow_id` for the **whole time the
  workflow is open** (`WorkflowManagerStore.ts:585` → `subscribeToWorkflowUpdates`),
  not just during a run. So **any** job_update tagged with that workflow_id reaches
  the per-workflow handler (`web/src/stores/workflowUpdates.ts`) and currently updates
  its `state`/`job_id` unconditionally (`workflowUpdates.ts` ~389-395). This is the
  "clobber" that makes inline/per-node jobs nudge the global run state.

### 2.3 Backend job model
- `packages/websocket/src/unified-websocket-runner.ts` — one
  `UnifiedWebSocketRunner` is created **per `/ws` connection**
  (`plugins/websocket.ts:139`). So `activeJobs = Map<jobId, ActiveJob>` is
  **per-client**.
- `ActiveJob` (`unified-websocket-runner.ts:672-687`) retains `context`
  (ProcessingContext), `runner` (the live kernel `WorkflowRunner`), and a plain-JS
  `graph` (NOT the runner's internal `Graph`).
- WS commands are processed **sequentially** (`await handleCommand` in the receive
  loop), which makes concurrency gating race-free.
- Before this work there was **no concurrency limit and no queue** — every `run_job`
  ran immediately.

### 2.4 The kernel (frozen DAG) — the key constraint
`packages/kernel/src/runner.ts`:
- `runner.ts:333` — `this._graph = new Graph(effectiveGraph)`; `Graph.nodes/edges`
  are `readonly` (`graph.ts:110-111`). The graph is **snapshotted at start**.
- `_initializeInboxes()` (`runner.ts:580-611`) — every `NodeInbox` is created **once**,
  keyed by node id, with upstream counts from static edges.
- `_processGraph()` (`runner.ts:746-820`) — spawns one `NodeActor` per node in a `for`
  loop over `this._graph.nodes`, collects `actorPromises`, then
  **`await Promise.all(actorPromises)`** (line 820). A **fixed** set: any actor added
  later is never awaited (orphaned).
- EOS via upstream source counting (`inbox.ts` `markSourceDone`, `_isHandleDone`
  ~514-519, `isFullyDrained` ~486-492). `_sendMessages` silently skips unknown target
  inboxes (~976-981).
- The only **live** injection primitive is `pushInputValue` (`runner.ts:239-269`) —
  pushes **data** into already-wired downstream inboxes of existing input nodes
  (`stream_input` command). `sendControlEvent` (`runner.ts:1181`) re-triggers a
  pre-existing **controlled** node. There is **no global cap on node execution**
  inside a job — all actors run concurrently.

---

## 3. What was implemented (PR #3391)

### 3.1 Backend per-client concurrency cap + FIFO queue ✅
- `packages/websocket/src/job-queue.ts` (new) — `JobConcurrencyQueue<T>` (generic over
  a minimal `{ job_id?, workflow_id? }`), FIFO `enqueue/dequeue/remove/positions`.
  Unit-tested (`packages/websocket/tests/job-queue.test.ts`).
- `unified-websocket-runner.ts` — `runJob()` is now a **gate**:
  `if (activeJobs.size >= MAX_CONCURRENT_JOBS) enqueue; else startJob`. The original
  body was renamed `startJob`. `drainQueue()` is called after every job-completion
  `activeJobs.delete` (the three completion paths: regular `streamJobMessages`,
  ComfyUI, chat). `cancelJob` also removes a still-queued run. A `queued` `job_update`
  carries `queue_position`.
- `settings-registry.ts` — registers `MAX_CONCURRENT_JOBS` (default **4**,
  configurable). Read best-effort (try/catch) so a settings-store failure falls back
  to the default rather than blocking runs.
- `packages/protocol/src/messages.ts` — `JobUpdate.queue_position?: number | null`.
- Frontend reflects "queued": `WorkflowRunner.ts` adds `queuePosition`;
  `workflowUpdates.ts` maps `queued`→running + sets position; `FloatingToolBar` run
  button tooltip shows `Queued (#N)`.
- **This covers the inline/generative tandem runs too** — they're `run_job`s on the
  same connection, so the cap/queue governs them automatically. This is the user's
  "cap N, queue the rest" exactly.

### 3.2 Heavy-node "large run" warning modal ✅
- `web/src/utils/heavyNodes.ts` (new) — `isHeavyNode(metadata)` classifies
  provider/model/API nodes via metadata (`required_settings` || `recommended_models`
  || `auto_save_asset`); `countHeavyNodes(nodes, getMetadata)` counts non-bypassed
  heavy nodes. Tested.
- `web/src/stores/RunWarningStore.ts` (new, **session-scoped**, not persisted) —
  drives the dialog and holds `suppressedThisSession` ("Don't ask again for this
  session"). Tested.
- `web/src/components/dialogs/RunWarningDialog.tsx` (new) — "Run anyway / Cancel" +
  checkbox; mounted once at app root (`web/src/index.tsx`).
- `useFloatingToolbarActions.handleRun` — warns only when heavy-node count exceeds the
  threshold and not suppressed.
- `web/src/stores/SettingsStore.ts` — `confirmLargeRun` (default true) +
  `largeRunThreshold` (default 5); `SettingsMenu.tsx` adds an "Execution" section.

### 3.3 Per-node "Run From Here" → concurrent ✅
- `web/src/hooks/nodes/useRunFromHere.ts` — switched from the gated per-workflow
  `run()` to `runInlineGraphJob` (independent job per click), removed the global gate,
  added per-node in-flight state (ref-guarded against double-fire). Each click is its
  own job, governed by the backend cap/queue. Tests rewritten;
  `useNodeContextMenu.test.ts` got a `runInlineGraphJob` mock (it uses the real hook).

### 3.4 Running-jobs count ⏳ (in progress, uncommitted)
- `web/src/stores/RunningJobsStore.ts` (new) — `jobs: Record<workflowId, jobId[]>`,
  maintained centrally in `workflowUpdates.ts` (add on `running`, remove on terminal),
  so it counts the full run + all concurrent node/generative jobs. `useRunningJobCount`
  selector. The Run button badge UI was not finished.

### 3.5 Commits
`ad78e77` feat(execution): queue concurrent runs + warn before large runs →
`d047fb3` fix queue type decoupling → `445d48d` fix best-effort settings read →
`895aa6b` concurrent per-node Run From Here. (Running-jobs count is local/uncommitted.)

---

## 4. Feasibility: inject a node into a running job ("Model B")

**Verdict: feasible only with substantial kernel changes.** The engine is a frozen
DAG (see §2.4). Blockers:

1. **Fixed completion** — `await Promise.all(actorPromises)` over a fixed array
   (`runner.ts:820`). A late actor is never awaited.
2. **Pre-wired inboxes** — created once, keyed by node id; a new node has no inbox and
   `_sendMessages` silently drops messages to unknown targets.
3. **Immutable graph** — `Graph.nodes/edges` are `readonly`; no `addNode`/mutation API
   anywhere in the kernel.
4. **EOS by upstream counting** — a node added after upstream EOS'd can't receive edge
   data; it must be fed from **cached results**.
5. No `add_node_to_job` command; `runInlineGraphJob`/`runSingleNode` always create a
   **fresh** job. `stream_input` only feeds data to pre-existing open input nodes;
   `resume`/`reconnect` only re-send cached state (not execution control).

**Minimal changes required (if pursued):**
- Kernel: replace fixed `Promise.all` with a **growable drain** (track a live actor
  set; finalize only when empty AND no pending injection); a `keepOpen` mode if the
  job should stay alive for future injections.
- Kernel: `addNode(node, incomingEdges)` — make the graph mutable (or a parallel
  registry), `getOrCreateInbox`, spawn+register an actor, wire active upstreams
  normally and **feed already-EOS'd upstreams from `ProcessingContext` cached
  results**, then send EOS so it runs once. `resolveExecutor` (`runner.ts:569`) already
  resolves new nodes dynamically.
- Backend: `add_node_to_job` command → `active.runner.addNode(...)`, stream under the
  same `job_id`; fall back to a new job if none is active.
- Frontend: route per-node runs to `add_node_to_job` when a job is running for the
  workflow (reuse the existing subgraph + `resolveExternalEdgeValue` + converters);
  else start a job.
- Behind a feature flag; kernel unit tests for inject-with-active-upstream,
  inject-with-EOS'd-upstream (cached), completion correctness, no orphaned actor.

**Important:** collapsing to one job removes the per-job concurrency cap's protection,
so Model B would need a **new in-kernel per-node throttle** to preserve the
overload protection the user originally wanted.

---

## 5. Architectural evaluation: separate jobs (A) vs. join running job (B)

| Dimension | A — Separate jobs | B — Join running job |
|---|---|---|
| Kernel changes | None | Large (growable completion, dynamic addNode/inbox/actor, cached-input feeding) |
| Risk | Low (fits engine; mostly built) | High (touches core completion/EOS; deadlock / premature-completion / orphaned-actor) |
| Effort | Small (finish + fix 1 test) | Multi-week; flag + incremental rollout |
| Provider-overload protection | **Already solved** (per-client cap + queue) | **Not solved** — needs a new in-kernel throttle |
| "One job" mental model | No — N jobs (show a count) | Yes — count stays 1 |
| Run-state cleanliness | Inline jobs nudge the per-workflow state; needs count store + a `job_id` guard | Naturally one state, but lifecycle ambiguous (drain vs keep-open) |
| Shared context / efficiency | Each job re-resolves+sends cached inputs | Reuses live context + cached results; shares resources |
| Cancellation | Per-job (clean) | Needs new granularity (one node vs whole job) |
| Observability / billing | One job = one trace/cost unit | Many node runs under one long job (murkier) |
| Isolation | Strong | Weaker |

**Recommendation: adopt Model A now**; keep Model B as a flag-gated future epic only
if "single job" becomes a hard product requirement.

- Model A already solves the original overload concern; Model B reintroduces it inside
  one job and needs new throttling.
- Model B's main win is the "one job" UX, which Model A approximates via the running-
  job **count** + a small `job_id` **guard** (so per-node jobs stop hijacking the main
  runner state, keeping "one full run at a time" correct while many node jobs run).
  Note: the guard requires updating `workflowUpdates.handlers.test.ts` /
  `workflowUpdates.test.ts`, which currently assert that *any* job_update drives state.
- Model B's lifecycle is the hard part: "inject only while running" loses the always-
  one-job benefit; "keep-open session" adds idle-timeout, finalize-on-disconnect, and
  billing-of-a-long-job complexity on top of the kernel work.

---

## 6. Current status & open items

- **CI (PR #3391):** build:packages, package tests, typecheck, and lint **pass**
  (after fixes `d047fb3`, `445d48d`). The **"Run App Tests" (jest) step fails** — the
  specific failing test was not identifiable from CI annotations (they only show
  unrelated pre-existing ESLint warnings), and the web jest suite could not be run in
  the sandbox at the time (npm registry was intermittently blocked; it is reachable
  now, so the failure is reproducible locally going forward).
- **Uncommitted:** the running-jobs count store + its `workflowUpdates` wiring (the
  Run-button badge UI was not finished).
- **Open decision:** Model A vs Model B (see §5). The recommendation is A; B is drafted
  in case it's chosen.
- **Known behavior note:** with per-node concurrent runs (3.3) but without the
  `job_id` guard, firing a node currently nudges the global run state (same pre-existing
  behavior as generative nodes). The guard is the clean fix and is part of finalizing
  Model A.

---

## 7. Key file index

Backend:
- `packages/websocket/src/unified-websocket-runner.ts` — job lifecycle, cap/queue gate,
  `runJob`/`startJob`/`drainQueue`/`cancelJob`, `ActiveJob`, `pushInputValue` plumbing.
- `packages/websocket/src/job-queue.ts` (+ `tests/job-queue.test.ts`) — the queue.
- `packages/websocket/src/settings-registry.ts` — `MAX_CONCURRENT_JOBS`.
- `packages/protocol/src/messages.ts` — `JobUpdate.queue_position`.
- `packages/kernel/src/runner.ts` — `_processGraph` (completion), `_initializeInboxes`,
  `pushInputValue`, `sendControlEvent`, `resolveExecutor`.
- `packages/kernel/src/graph.ts`, `inbox.ts`, `actor.ts` — graph/inbox/actor model.

Frontend:
- `web/src/stores/WorkflowRunner.ts` — per-workflow runner factory + busy guard.
- `web/src/stores/workflowUpdates.ts` — central per-workflow message handler.
- `web/src/lib/workflow/runInlineGraphJob.ts` — independent inline job dispatch.
- `web/src/hooks/nodes/useRunFromHere.ts`, `useRunSingleNode.ts`,
  `useRunSelectedNodes.ts`, `nodes/useInputNodeAutoRun.ts` — run entry points.
- `web/src/hooks/useFloatingToolbarActions.ts`, `components/panels/FloatingToolBar.tsx`
  — Run Workflow button + warning.
- `web/src/utils/heavyNodes.ts`, `stores/RunWarningStore.ts`,
  `components/dialogs/RunWarningDialog.tsx` — large-run warning.
- `web/src/stores/RunningJobsStore.ts` — running-jobs count (in progress).
- `web/src/stores/SettingsStore.ts`, `components/menus/SettingsMenu.tsx` — settings.
