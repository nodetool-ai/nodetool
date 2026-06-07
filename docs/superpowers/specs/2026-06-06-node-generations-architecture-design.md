# Node Generations — Results Architecture Redesign

**Date:** 2026-06-06
**Status:** Design approved, pending spec review
**Scope:** `web/` only. No backend changes required for v1.

## Problem

A node's "result" is represented three different ways today, with no single
read model:

1. **`useResultsStore`** — live in-memory `results` (`node_complete` envelope,
   `{handle: value}`) **and** `outputResults` (bare/accumulated values from
   `output_update`, `tool_result_update`, hydration). Keyed `wf:job:node`.
2. **`useNodeResultHistory`** — DB-backed `assets.list({node_id})`: every saved
   asset for a node across all runs. The durable, server-side generation list
   (media only).
3. **`workflowResultHydration`** — a bridge copying assets into
   `outputResults[hydrated]`.

Consequences:

- **No single source of truth.** Every reader reconciles `outputResults ?? results`
  and then unwraps an envelope-vs-bare shape. Readers that got it wrong silently
  showed nothing (the run-path and display-path bugs fixed earlier this session).
- **Job-centric resolution.** "What does a node show / feed downstream" is
  answered by picking a *focused run* and reading its bucket. When focus moves to
  a per-node "Run Node" job, every other node's preview blanks. The current
  workaround (`orderedRunJobIds` search across runs) is a patch over the wrong
  primary key.
- **No way to choose a generation.** `NodeHistoryViewer` already pages a node's
  asset history with `< >`, but the index is local `useState` — view-only, with
  no effect on what downstream consumes.

## Target model: the node owns a timeline of generations

Invert the primary key. The node owns an ordered **list of generations**; a run
is just the event that appends one. "What shows / feeds downstream" is answered
by picking a **generation**, not a run.

A **generation** is one output instance of a node (one asset, or one run's value
for non-media). "Hydrated vs live" is invisible to consumers.

```ts
interface Generation {
  id: string;                          // stable: assetId (persisted) or jobId (live)
  jobId: string | null;                // provenance
  createdAt: number;                   // ordering
  outputs: Record<string, unknown>;    // handle -> value, normalized ONCE at write
  status: "running" | "completed" | "error";
  cost?: ProviderCost;
  error?: string;
  assetId?: string;                    // present for persisted media generations
}
```

### Single source of truth = one accessor, source hidden

"Single source of truth" means **one read API**, not one physical bucket. The
accessor merges two role-separated backings and hides which is which:

- **Durable** — persisted media generations from the workflow asset store
  (assets loaded on workflow open, grouped by `node_id`, refetched on run
  completion). This is the server-side persistence (already exists).
- **Live** — a per-node in-memory buffer fed by `node_update` for the current
  session's runs. Also the only home for non-media outputs (text, numbers,
  dataframes), which never become assets and are therefore session-scoped.

Merge rule: take **all** persisted generations (one per asset), **plus** live
generations whose `jobId` is not yet represented in the persisted set. A run's
live generation is superseded once its assets land (a batch run that saved 4
images becomes 4 persisted generations, replacing the single in-flight one).
Result is one time-ordered list.

```ts
// reactive (display)
useNodeGenerations(wf, node): {
  generations: Generation[];
  current: Generation | undefined;     // selected ?? latest
  select(generationId): void;
}
// sync (run path / selectors)
getNodeGenerations(wf, node): Generation[];
getCurrentOutput(wf, node, handle?): unknown;   // current.outputs[handle]
```

This accessor **replaces** `upstreamResult.ts`
(`readNodeResult` / `resolveNodeResultAcrossRuns` / `orderedRunJobIds` /
`makeUpstreamResultGetter`) — those were the focused-run patch and retire here.
The accessor is the migration seam: consumers already call into that module, so
they re-point rather than rewrite.

### Selected generation (the "pick the best" feature)

- Per-node pointer, **persisted as node data** (`ui_properties.selected_generation`,
  saved with the workflow). References `assetId` for media (stable across reload);
  a session id for non-media.
- Default when absent: latest generation.
- Producing a new generation for a node sets the pointer to that new (latest)
  generation. A manual pick persists until the next run of that node or another
  pick. (v1 rule — keeping an old pick across re-runs is a future refinement.)
- Downstream resolution reads `getCurrentOutput(upstream)`, which honors the
  pointer. So a deliberate pick feeds downstream and survives reload for media.

### WS message roles, cleanly separated

| Message | New role |
|---|---|
| `node_update` | The **only** creator/finalizer of a generation (value, status, cost, error) — for every node. running → append a `running` generation; completed → finalize `outputs`; error → `error`. |
| `output_update` | **Output nodes only.** Feeds an ephemeral live-stream display buffer for progressive rendering during a run. Not a value, not a generation source. |
| `tool_result_update` | Moves to the **artifact** channel beside `toolCalls` (it pairs with `tool_call_update` for the agent-node log). Not a node output. |

## Component / module changes

**New**
- `web/src/utils/nodeGenerations.ts` — pure merge (durable + live, dedup by
  jobId), `getNodeGenerations`, `getCurrentOutput`, selection resolution
  (`selected ?? latest`).
- `web/src/hooks/nodes/useNodeGenerations.ts` — reactive hook over the workflow
  asset store + live buffer + node `selected` pointer.

**Changed**
- `ResultsStore` — `results` becomes the **live generation buffer** (keyed by
  node, generations by jobId, carrying status/cost/error). `outputResults`
  demoted to the **output-node stream buffer** only. `tool_result_update` →
  `toolCalls`/artifacts.
- `workflowUpdates.ts` — rewrite writers per the message-roles table.
- `useNodeIO.ts`, `useNodeExecState.ts`, `SketchNode.tsx`, the run hooks
  (`useRunFromHere`, `useRunSingleNode`, `useRunSelectedNodes`) — read via the
  generations accessor instead of focused-run lookups.
- `NodeHistoryViewer.tsx` — `currentIndex` `useState` → the persisted `selected`
  pointer (read/write node data); grid + `< >` set the current generation.
- `OutputNode.tsx` — reads the output-node stream buffer for live display, the
  generation for the settled value.

**Removed**
- `workflowResultHydration.ts` (assets read directly via the accessor).
- `upstreamResult.ts` and `ResultsStore.readNodeResult` (superseded).
- Focused-job result coupling. `WorkflowRunsStore.focusedJob` stays **only** for
  edge animation / active-run highlighting, not result resolution.

## Build sequence

1. **Accessor + live buffer.** Build `nodeGenerations.ts` + `useNodeGenerations`
   over the existing asset store; add the live generation buffer to `ResultsStore`
   (write from `node_update` in parallel with current writers, behind the new
   accessor). No consumer change yet. Unit-test merge/dedup/selection.
2. **Selection.** Add `selected_generation` to node data; wire
   `NodeHistoryViewer` `< >`/grid to write it; accessor honors it.
3. **Re-point readers.** Move display hooks + run hooks onto the accessor.
   Verify previews persist across per-node runs and downstream uses the pick.
4. **Writers cleanup.** `output_update` → output-node buffer only;
   `tool_result_update` → artifacts; stop populating the old value paths.
5. **Delete.** `workflowResultHydration`, `upstreamResult`, `readNodeResult`,
   dead `outputResults`/focused-job paths. Full test pass.

## Edge cases & decisions

- **Live↔asset supersession:** drop a live generation once any persisted asset
  exists for its `jobId` (the concrete assets replace the in-flight placeholder).
- **Non-media** generations are session-scoped (no asset); gone on reload — same
  as today.
- **New generation auto-selects** (becomes latest/current).
- **Concurrent full runs** append generations per node; a node shows its latest.
  A consistent per-run snapshot view is out of scope (would filter generations by
  jobId).
- **`ui_properties.selected_generation` persistence** — verify the backend
  passes unknown `ui_properties` keys through round-trip (it is a UI blob).

## Testing

- Unit: merge/dedup (live vs asset same jobId → one), `selected ?? latest`,
  `getCurrentOutput` by handle, non-media session-only path.
- Integration: per-node run no longer blanks other previews; `< >` selection
  feeds downstream; selection persists across reload for media; output node live
  stream still renders; tool-result no longer leaks into a node's value.

## Out of scope (v1)

- Backend changes (assets already carry `node_id`/`job_id`; selection rides node
  data).
- Multi-generation persistence for non-media outputs.
- Consistent per-run snapshot view.
- Cross-node "compare generations" UI beyond the existing grid.
