# Implementation Plan: Real-Time Collaborative Workflow Editing ("Multiplayer")

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-07-10
**Design doc:** [multiplayer-design.md](multiplayer-design.md)

This plan turns the design into ordered, reviewable PRs with file-level targets, exit criteria, and a rollout checklist. Estimates assume one engineer full-time; workstreams marked ∥ can run in parallel with a second engineer.

---

## 0. Ground rules

- Every PR passes `npm run check` (typecheck + lint + test) and follows repo conventions: strict TS, no `any`, ui_primitives only (no raw MUI), design tokens, Zustand selectors, tests in `__tests__/`.
- New backend code lands in a new workspace package `packages/collab` plus surgical changes to `packages/websocket`, `packages/models`, and `web/`. No changes to `packages/kernel`, `packages/runtime`, or any node package — if a PR touches those, it violates design goal G4 and needs a design amendment first.
- All schema changes are additive, mirrored in `packages/models/src/schema/` and `schema-pg/`, registered in `packages/models/src/migrations/versions.ts`, and covered in `migrations.test.ts` (the suite asserts `tableExists`).
- Feature flags via the existing settings registry (`packages/websocket/src/settings-registry.ts` → `registerSetting`): `collab_occ` (Phase 0 save safety), `collab_presence` (Phase 0 UI), `collab` (Phase 1 CRDT). Everything defaults **off** until the rollout checklist says otherwise.

---

## Phase 0 — Save safety + presence (no CRDT) · ~2 eng-weeks

Ships standalone value: kills silent last-write-wins data loss and adds presence. Nothing in Phase 0 depends on Yjs.

### PR-1: Optimistic concurrency on workflow saves (~3 days)

**Server** — `packages/websocket/src/trpc/routers/workflows.ts`:
- Extend `updateInput` (the `update` mutation, ~line 489) and `autosaveInput` (~line 706) with optional `base_updated_at: string`.
- When present and ≠ the row's current `updated_at`, throw a tRPC `CONFLICT` (the error formatter already maps `ALREADY_EXISTS`/`CONFLICT`; add a distinct `STALE_WRITE` code in `packages/websocket/src/error-codes.ts` so clients can discriminate). Return the server's current `updated_at` and graph in the error payload.
- Omitted token ⇒ today's behavior (older clients, CLI keep working).

**Client** — `web/src/stores/WorkflowManagerStore.ts` (`saveWorkflow`, ~line 314) and the autosave path:
- Track `updated_at` from the last successful load/save per workflow; send as `base_updated_at`; update it from every save response.
- On `STALE_WRITE`: conflict dialog (ui_primitives) with three actions — **Reload theirs** (refetch, discard local), **Overwrite** (resend without token), **Keep both** (save local graph as a manual version via the existing `versions.create` mutation, then reload). Autosave never overwrites: on conflict it silently snapshots local state as an autosave version and backs off until the user decides.

**Interplay fix (required, not optional):** `web/src/stores/resourceChangeHandler.ts` currently invalidates `["workflows"]` on every workflow change, which refetches and clobbers a dirty open editor. Gate that invalidation: if the changed workflow is open **and dirty**, surface the conflict banner instead of refetching.

**Tests:** router unit tests (token match / mismatch / omitted); `WorkflowManagerStore` tests for token threading and each conflict action; regression test for the dirty-editor refetch clobber.

**Exit:** two clients racing on one workflow can no longer silently lose work, with `collab_occ` on.

### PR-2: Awareness channel, server side (~2 days)

- New module `packages/websocket/src/collab/presence-registry.ts`: in-memory `Map<workflow_id, Map<socket_id, AwarenessState>>`, join/leave/update, 30 s stale eviction, broadcast to co-members.
- Wire three message types into the dispatch switch in `packages/websocket/src/unified-websocket-runner.ts` (the `case` block starting ~line 5849): `collab_join`, `collab_leave`, `collab_awareness`. MsgPack frames like every other message; no new socket, no new port.
- Authz on `collab_join`: reuse the access check pattern from the workflows router (`access !== "public" && user_id !== ctx.userId` ⇒ deny, plus collaborators table once PR-9 lands).
- Message schemas in `packages/protocol/src/` (new `collab.ts`), since protocol is the shared-types package. **Note:** protocol changes require `cd packages/protocol && npm run build` before mobile typecheck — CI already handles this.
- OTel: `collab.presence.join/leave` events; gauge for members per workflow.

**Tests:** registry unit tests (join/leave/evict/broadcast); an integration test in `packages/websocket/tests/` driving two fake sockets through join → awareness → leave.

### PR-3: Presence UI (~4 days) ∥ after PR-2's protocol types merge

- `web/src/lib/collab/PresenceChannel.ts`: thin client over `globalWebSocketManager` (`web/src/lib/websocket/GlobalWebSocketManager.ts` — singleton, per CLAUDE.md never a new socket): join on workflow open (hook into `WorkflowManagerStore` open/close lifecycle), throttle outgoing cursor/selection to ~15 Hz, resend state on reconnect (subscribe to the manager's reconnect event).
- `web/src/stores/CollabPresenceStore.ts`: Zustand store keyed by workflow id → member list with cursor/selection; selectors per member to keep re-renders scoped.
- UI (all ui_primitives + design tokens):
  - **Roster**: avatar row in the editor header; stable per-user color derived from user id hash.
  - **Remote cursors**: absolutely-positioned overlay inside the ReactFlow viewport (transform flow-coords → screen via ReactFlow's viewport state; rAF-batched).
  - **Selection highlights**: colored outline on nodes present in a remote member's selection.
  - **Banner**: "N others viewing/editing" using the existing notification/banner primitives.
- Own selection/cursor published from existing ReactFlow callbacks (`onSelectionChange`, pane `onMouseMove` throttled).

**Tests:** store tests; RTL component tests for roster/banner; one Playwright two-context smoke (second browser's cursor appears) — this bootstraps the multi-client e2e harness Phase 1 needs.

**Phase 0 exit / dogfood gate:** flags on for the team workspace ≥1 week; zero clobbered-save reports; presence latency < 2 s observed.

---

## Phase 1 — CRDT co-editing · ~7 eng-weeks

### PR-4: `packages/collab` — document model (~1 week) ∥ with PR-2/3

New workspace package (depends only on `@nodetool-ai/protocol`; register in root workspaces and `build:packages` order — it has no decorators, so no `dist/`-loading caveats):

- `src/doc-model.ts`: shared-type layout (`nodes`/`edges`/`meta` maps per design §5.1); typed accessors.
- `src/convert.ts`: `docFromGraph(graph): Y.Doc`, `graphFromDoc(doc): Graph` — pure, lossless, the contract everything else leans on.
- `src/invariants.ts`: `enforceGraphInvariants(doc, transaction)` — edge GC for dangling endpoints after delete-vs-edit races, duplicate-edge collapse; runs inside the same Yjs transaction.
- `src/protocol.ts`: sync/awareness frame encode/decode wrapping `y-protocols` (opaque bytes in MsgPack fields).

**Tests (the heart of this PR):** round-trip property tests (`fast-check`) over generated graphs: `graphFromDoc(docFromGraph(g)) ≡ g`; convergence property tests — N docs, random interleaved concurrent ops, sync pairwise ⇒ identical `graphFromDoc` output **and** invariants hold; targeted delete-vs-edit fuzz for edge GC. Budget half the PR's time for these tests; they are the cheapest place this project can fail.

**Deps:** `yjs`, `y-protocols`, `fast-check` (dev). Pin exact versions; both are pure-JS ESM (no native modules, no sandbox install pain).

### PR-5: Persistence — schema + migrations (~2 days)

- `packages/models/src/schema/workflow-crdt.ts` (+ `schema-pg/` mirror): `workflow_crdt_updates` (id, workflow_id, seq, update blob, user_id, created_at; index workflow_id+seq) and `workflow_crdt_snapshots` (id, workflow_id, seq_through, snapshot blob, created_at; index workflow_id+seq_through desc). Export from both `schema/index.ts` files.
- `workflow_collaborators` (workflow_id, user_id, role, invited_by, created_at; pk workflow_id+user_id).
- Migrations `create_workflow_crdt_tables`, `create_workflow_collaborators` appended in `packages/models/src/migrations/versions.ts` with down-migrations, covered in `migrations.test.ts`.
- DAO `packages/models/src/workflow-crdt.ts`: `appendUpdate`, `loadSince(seq)`, `latestSnapshot`, `compact(seqThrough, snapshot)` (transactional), `collaboratorsFor(workflowId)`.

### PR-6: Server — `CollabRoomManager` (~2 weeks)

`packages/websocket/src/collab/room-manager.ts` + `room.ts`, replacing PR-2's presence registry internals (presence becomes room-scoped; wire protocol unchanged so PR-3's client needs no changes):

- **Lifecycle:** first join loads snapshot + update tail via the DAO, else seeds from `workflow.graph` with `docFromGraph`; last-leave flush + 60 s grace eviction.
- **Update path:** authz (editor role) → apply to room doc → rebroadcast to other members → batched append to `workflow_crdt_updates` (single writer loop per room; batch inserts for SQLite friendliness).
- **Sync:** `collab_join` reply carries state vector + snapshot; handle sync1/sync2 frames via `packages/collab` protocol helpers.
- **Compaction:** threshold 500 updates or on eviction; snapshot + delete-covered-updates in one transaction.
- **Materialized flush:** debounced 2 s idle / 15 s max; write `graphFromDoc(doc)` through the same internal save routine the `update` mutation uses (so `updated_at` advances, the ModelObserver resource-change event fires, and autosave versions accrue). Tag the write with a room origin so the OCC check (PR-1) knows it's the authority.
- **External-writer rebase:** when a non-collab write lands on a workflow with a live room (detected via the OCC token path), diff incoming JSON vs `graphFromDoc(doc)` and apply the delta as a Yjs transaction with a `rebase` origin.
- **Divergence guard:** on a client-reported state-vector-hash mismatch, send authoritative re-sync; count it; log both encoded states at debug level.
- **Run-submit hook:** the `run_job` path forces a flush for workflows with a live room before job creation.
- OTel spans `collab.room.load`, `collab.update.apply`, `collab.flush`, `collab.compact`; metrics per design §6.

**Tests:** room unit tests (lifecycle, authz, batching, compaction transactionality); integration tests with two fake sockets (join → concurrent updates → convergence → flush lands in `workflows` table → resource event observed); rebase fuzz tests; restart simulation (kill room, rejoin, sync from persistence).

### PR-7: Client — `YjsGraphBinding` (~2 weeks) ∥ with PR-6 against a stub room

`web/src/lib/collab/YjsGraphBinding.ts`, owned per-workflow by `WorkflowManagerStore`:

- **Store → doc:** wrap the `NodeStore` mutation surface — `onNodesChange`, `onEdgesChange`, `onConnect`, `addNode`, `updateNode`, `updateNodeData`, `deleteNode(s)`, `setNodes`, `setEdges` (all in `web/src/stores/NodeStore.ts`) — mirroring each mutation into a Y transaction tagged `localOrigin`. Position drags coalesced to ~30 Hz, one transaction per frame.
- **Doc → store:** deep-observe handler translating remote transactions into minimal store mutations, entering the store through a `remote: true` path so wrapped actions don't echo back into the doc, and marked to not dirty the workflow (the store already has a shouldn't-dirty pattern, NodeStore.ts ~line 808) — collab edits must not trigger the legacy autosave.
- **Save suppression:** in collab mode, `saveWorkflow`/autosave become no-ops for the graph (server room flush is the writer); manual "save version" calls the versions mutation directly.
- **Undo/redo:** `Y.UndoManager` over `nodes`/`edges`/`meta`, `trackedOrigins: {localOrigin}`; the editor's undo/redo entry points dispatch to it in collab mode, `zundo` temporal path untouched otherwise. Keyboard shortcuts unchanged.
- **Sync client:** join/sync/update/reconnect state machine over `globalWebSocketManager`; buffered local edits merge on reconnect; periodic state-vector hash for the divergence guard; on server-forced re-sync, rebuild store from doc.
- **Mode selection:** binding created only when `collab` flag is on **and** the workflow is server-backed and shared/multi-member-capable; pure-local desktop workflows never enter collab mode.

**Tests:** binding unit tests against an in-memory `Y.Doc` pair (each store action round-trips; remote ops produce exact store mutations; echo prevention; undo isolation); store integration tests for save suppression and no-dirty remote edits; jsdom perf smoke for the 500-node update-storm budget.

### PR-8: Collaborative signals in the editor (~3 days)

- Run-status mirroring: initiating client publishes `{running_nodes}` into its awareness state; collaborators render the existing node-running affordance in the runner's color.
- Cache interplay e2e: collaborator edits an upstream node ⇒ my "run from here" signature dirties (should be automatic via `computeRunSignatures`; this PR proves it with a test, changes nothing).
- Version restore while a room is live: route the `versions.restore` mutation through the room rebase path (PR-6 mechanism) instead of a raw graph write.

### PR-9: Permissions + sharing surface (~3 days)

- Enforce `workflow_collaborators` roles at `collab_join` (editor/viewer/deny) and per `collab_update` (viewer updates dropped + logged).
- tRPC mutations: `collaborators.list/add/remove` on the workflows router; minimal share dialog in the editor header (ui_primitives) — add by email/user id, role toggle.
- Public-workflow live observation stays behind its own flag, default off.

### PR-10: Multi-client e2e + chaos suite (~1 week, overlaps 6–9)

- Extend the Playwright harness from PR-3: two browser contexts, one workflow — edit propagation, both-edit-same-node property LWW, delete-vs-edit edge GC, undo isolation, reconnect-and-merge, presence rendering, conflict dialog (Phase 0 path with flag off).
- Chaos at the transport seam: inject a frame-mangling proxy (drop/reorder/duplicate `collab_update`) and assert convergence via state-vector hash.
- Perf budget test: 500-node graph, 4 simulated editors at full rate, assert frame time and store-update latency budgets.

---

## Sequencing

```
Phase 0:  PR-1 ──► dogfood ─────────────────────────────┐
          PR-2 ──► PR-3 ─────────────► dogfood          │
                                                        ▼
Phase 1:  PR-4 ─┬─► PR-6 ─┬─► PR-8 ─► PR-9 ─► PR-10 ─► dogfood ─► GA
                │          │
          PR-5 ─┘    PR-7 ─┘   (PR-6 ∥ PR-7 via stubbed counterpart)
```

Total: ~9 eng-weeks serial; ~6–7 calendar weeks with two engineers (PR-3∥PR-4, PR-6∥PR-7).

---

## Rollout checklist

1. **Phase 0 dogfood:** `collab_occ` + `collab_presence` on for the team workspace ≥1 week. Gate: zero lost-work reports, zero false-positive conflict dialogs.
2. **Phase 0 GA:** `collab_occ` default-on everywhere (it is pure safety); presence default-on for hosted.
3. **Phase 1 dogfood:** `collab` on for team workspace ≥2 weeks. Gates: **zero** divergence-counter increments; p95 remote-edit latency < 500 ms; flush lag p99 < 20 s; compaction keeping logs < 2× threshold; both editor code paths (collab/solo) green in CI.
4. **Phase 1 GA (hosted):** default-on; self-hosters receive via normal upgrade (migrations are additive; flag still available as kill switch).
5. **Kill switch drill (before GA):** disable `collab` mid-session in staging; verify clients fall back to solo mode, materialized JSON is current, no data loss.

Monitoring to have in place before step 3: divergence counter (pages), room count / members gauge, update rate, broadcast latency histogram, flush lag, compaction duration, `workflow_crdt_updates` row-count alert at 10× threshold.

---

## Risk register (implementation-level)

| Risk | Mitigation | Where |
|---|---|---|
| `NodeStore` has mutation paths not on the wrapped action list (bulk ops, timeline/sketch side stores writing nodes) | Audit every `set()` touching `nodes`/`edges` in NodeStore.ts during PR-7; add a dev-mode assertion that the doc and store hash-match after each transaction | PR-7 |
| Legacy autosave fires in collab mode and double-writes | Save suppression tested explicitly; server rejects graph writes from collab-mode clients (origin check) | PR-6/7 |
| `resourceChangeHandler` refetch fights the binding | Collab-mode workflows opt out of workflow query invalidation (binding is the sync channel) | PR-7 |
| Yjs update floods from position drags degrade ReactFlow | 30 Hz coalescing + rAF apply batching; perf budget test | PR-7/10 |
| SQLite write stalls under append load on self-hosted boxes | Batched appends in room writer loop; measured in dogfood before GA | PR-6 |
| Protocol drift between web and mobile | Frames defined once in `packages/protocol`; mobile ignores unknown message types today (verify in PR-2) | PR-2 |

## Explicit non-goals of this plan (deferred with the design doc)

Y.Text prompt merging, comments/annotations, follow-mode, offline-first merge, horizontal room scale-out, anonymous public observers, org/team permissions.
