# Concurrent Same-Workflow Runs — Design

**Date:** 2026-06-03
**Status:** Design approved; implementation pending

## Goal

Let the **same workflow run multiple times concurrently**. The editor canvas shows
one run's *execution* at a time — a "lens" the user selects from the queue overlay —
while node **results and outputs accumulate across all runs** so they can be compared.

Today the backend forces same-workflow runs to be sequential (`hasActiveJobForWorkflow`),
and the frontend keys all node-level state by `workflowId:nodeId`, so two runs of one
workflow would clobber each other. This redesign lifts the serialization and splits
node-level state into two categories with different lifetimes.

A prerequisite bug fix already landed: `WorkflowRunner.run()` now returns the id of the
run it initiated (queued or fresh) instead of `void`, and the sketch/timeline/mini-app
hooks use that id rather than re-reading the stale `runnerStore.job_id`. Without it, a
second concurrent run subscribed to the previous run's job and stranded its updates.

## The model: telemetry follows the lens, products accumulate

Every backend message already carries both `workflow_id` and `job_id` (stamped in
`unified-websocket-runner.ts` `streamJobMessages`). We use `job_id` to split node-level
state into two categories:

- **Execution telemetry** — *what a run is doing right now*: node status, edge
  activity/animation, progress, execution time, errors, and the streaming artifacts
  (chunks, tasks, tool calls, planning). **Keyed per job; the canvas renders the
  focused run's slice.** Selecting a different run replays that run's execution.
- **Durable products** — *what a run produced*: a node's `result` / `output`s.
  Auto-saved media (image/audio/video) is **persisted as `Asset` records** keyed by
  `(workflow_id, node_id, job_id)` and kept in the DB until the user deletes it; the
  across-run gallery reads it back via `assets.list`, so it survives reloads with **no
  run cap**. Non-media results (text, numbers, dicts, intermediate values) aren't
  persisted today and stay in the in-memory per-job layer. Either way products render
  **across all runs**, never swapped by focus.

```
focusedJobId : workflowId → jobId        // which run the canvas is "watching"
```

## Architecture

### Backend — allow concurrency

`UnifiedWebSocketRunner.runJob` (`packages/websocket/src/unified-websocket-runner.ts`)
currently queues a run when `hasActiveJobForWorkflow(req.workflow_id)` is true. Drop that
condition from the gate so same-workflow runs start immediately, bounded only by the
global `MAX_CONCURRENT_JOBS` cap; runs beyond the cap still queue FIFO and drain as slots
free (`drainQueue`). `drainQueue`'s `hasActiveJobForWorkflow` filter is likewise removed.

No message-shape changes: jobs already have isolated `ProcessingContext`s and every
outbound message is stamped with `job_id` + `workflow_id`. Persistence, cancel, and
reconnect are already per-`job_id`.

With the cap set to 1, behavior is identical to today (full serialization) — a safe
operational fallback.

### Frontend — split the stores

| State | Source message | Store today | New keying |
| --- | --- | --- | --- |
| Node status | `node_update.status`, `prediction` | `StatusStore` `wf:node` | **`wf:job:node`** |
| Edge activity | `edge_update` | `ResultsStore.edges` `wf:edge` | **`wf:job:edge`** |
| Progress | `node_progress` | `ResultsStore.progress` `wf:node` | **`wf:job:node`** |
| Execution time | derived from `node_update` | `ExecutionTimeStore` `wf:node` | **`wf:job:node`** |
| Node error | `node_update.error` | `ErrorStore` `wf:node` | **`wf:job:node`** |
| Chunks / tasks / tool calls / planning | streaming updates | `ResultsStore.*` `wf:node` | **`wf:job:node`** |
| Provider cost | `node_update.provider_cost` | `ResultsStore` `wf:node` | **`wf:job:node`** |
| **Result / outputs — media** | `node_update.result`, `output_update` (auto-saved) | `ResultsStore` `wf:node` (live) | **DB `Asset` by `(wf, node, job)`**; in-memory = live mirror |
| **Result / outputs — non-media** | same | `ResultsStore` `wf:node` | **`wf:node → { job: value }`** (in-memory, ephemeral) |

Execution-telemetry maps gain a `job` segment in their key; canvas selectors resolve it
through `focusedJobId`. Durable-product maps keep the node key but hold a per-job
collection, surfaced across runs.

### Runs registry + focus

A new per-workflow registry tracks the live set of runs and the focus:

- **`useWorkflowRunsStore`** (new Zustand store) — `workflowId → { jobId → RunMeta }` and
  `workflowId → focusedJobId`. `RunMeta` = `{ jobId, state, startedAt, label, progress }`.
  Populated by `handleUpdate` from `job_update`/`node_update`. `label` is derived from the
  run's distinguishing params (the prompt, a seed…), falling back to `deriveJobTitle`.
- **Focus** defaults to the most recently *started* run and is **pinnable** (selecting a
  run in the overlay pins it). If the focused run is removed/evicted, focus falls back to
  the newest active run, then the newest done run, then none (execution chrome clears;
  the results gallery persists).

### `handleUpdate` rework

`web/src/stores/workflowUpdates.ts` currently routes everything through a single
per-workflow `runnerStore` and uses `isRunnerJob` to decide whether an update may drive
runner state. Under concurrency:

- **Node/execution updates** write job-scoped stores using `data.job_id` directly — no
  `isRunnerJob` gating, no dependence on `runnerStore.job_id`.
- **Durable products** append into the per-job collection under the node.
- The registry is updated from `job_update` (lifecycle) and `node_update` (per-node
  progress/status), independent of which run the editor "started".
- `runnerStore`'s role shrinks to connection management, starting runs, notifications,
  and the editor toolbar's Run/Stop target (now `focusedJobId`). It no longer keys node
  state.

### Clearing semantics

`WorkflowRunner.run()` today clears the whole workflow's node state on start
(`clearStatuses(wf)`, `clearResults(wf)`, …). Under concurrency a new run must **not**
wipe siblings or the accumulated gallery. A fresh `jobId` has an empty execution slice,
so the broad clears are removed; per-job execution state simply starts empty.
`PropertyValidationStore.clearWorkflow` (pre-flight highlights) stays workflow-level.

### Canvas rendering

- **Execution chrome** (status badge, edge animation, progress bar, exec-time, error)
  reads the focused job's slice via `focusedJobId`.
- **Output/preview nodes** render a **results gallery across all runs**; the focused
  run's tile is ringed; clicking a tile pins focus to that run. The gallery wraps /
  scrolls / collapses to "+N" as runs pile up.
- **Other nodes** render the **focused run's** inline result (coherent with the lens),
  with a small count badge when multiple runs produced a value; the badge opens a per-run
  popover. *(This is the one rendering judgment call — products are stored across-run for
  every node; only the default inline surface differs. Easy to flip to always-gallery.)*

### Queue overlay = the run selector

`web/src/components/panels/QueueOverlay.tsx` is reused as the focus selector. It keeps its
`jobs.list` source (`useRunningJobs`), collapse/expand, and Running/Enqueued/Cancelled
sections, and gains:

- a **focus affordance** — clicking a running/done card for the *current* workflow pins
  its `focusedJobId` (the focused card shows an accent bar + "On canvas" indicator);
  clicking a card for another workflow switches to that workflow first;
- per-run **labels** from distinguishing params instead of the workflow name;
- a **"Done · this session"** section with output thumbnails, clickable to focus.

### Cancel / reconnect

- Editor **Stop** targets `focusedJobId`; an overlay card's ✕ targets that card's job
  (already `trpcClient.jobs.cancel({ id })`).
- **Reconnect** on reload iterates all active jobs for open workflows (today it reconnects
  a single job), repopulating the registry and per-job execution state. The across-run
  gallery repopulates from `assets.list` (DB) independently — only *live* execution
  telemetry needs the job reconnect.

## Lifecycle decisions

- **Result retention:** auto-saved **media** results persist in the DB as `Asset`s keyed
  by `(workflow_id, node_id, job_id)` — kept until the user deletes them. The across-run
  gallery reads them via `assets.list` filtered by workflow + node (tagged by job), so it
  **survives reloads with no run cap** and paginates from the DB. **Non-media** results
  (intermediate text/numbers/dicts) aren't persisted today and remain in the in-memory
  per-job layer for the session/connection. An in-flight run shows a live tile from the
  in-memory result until its asset lands, at which point the `["assets"]` invalidation
  swaps in the persisted one.
- **Single run = today.** With one run, `focusedJobId` is that run and every surface
  behaves exactly as before — zero new UI, no overlay focus chrome.

## What stays the same

- Backend message protocol, persistence, per-job cancel/reconnect.
- Cross-workflow concurrency (already supported, capped) and the global cap/queue.
- Per-item generation surfaces (`SketchGenerationStore`, `TimelineGenerationStore`) —
  already job-keyed; they benefit from the backend gate lift without structural change.

## Testing

- **Unit:** job-scoped key helpers; `focusedJobId` selectors; focus default/fallback
  transitions; product accumulation + 10-run eviction; `handleUpdate` writes by
  `data.job_id`; clear-on-run no longer wipes siblings.
- **Integration:** two concurrent same-workflow runs keep separate execution state;
  switching focus swaps execution chrome but not the gallery; results from both appear on
  the output node; Stop/✕ target the correct job.
- **Backend:** concurrent same-workflow jobs run in parallel up to the cap; overflow
  queues and drains; `MAX_CONCURRENT_JOBS=1` reproduces full serialization.

## Out of scope

- A dedicated side-by-side **Compare** mode (small-multiples / mini-canvases per run).
- Param-diff UI beyond run labels.
- Persisting **non-media** / intermediate node results to the DB (only media auto-saves
  today; unchanged).

## Affected files

- `packages/websocket/src/unified-websocket-runner.ts` — `runJob` / `drainQueue` gate.
- `web/src/stores/StatusStore.ts`, `ErrorStore.ts`, `ExecutionTimeStore.ts`,
  `ResultsStore.ts` — job segment for telemetry; per-job collections for products.
- `web/src/stores/workflowUpdates.ts` — route by `data.job_id`; update registry.
- `web/src/stores/WorkflowRunner.ts` — Run/Stop target = `focusedJobId`; drop broad clears;
  multi-job reconnect.
- `web/src/stores/WorkflowRunsStore.ts` *(new)* — runs registry + `focusedJobId`.
- `web/src/components/panels/QueueOverlay.tsx` — focus selection, labels, Done section.
- `web/src/serverState/useJobAssets.ts` + a per-node assets hook — gallery source; may
  extend the `assets.list` tRPC input to filter by `node_id` + `workflow_id` (the `Asset`
  model already supports it).
- Canvas node/edge components — read focused slice; output-node results gallery (DB-backed).
