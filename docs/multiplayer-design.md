# Real-Time Collaborative Workflow Editing ("Multiplayer")

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-07-10
**Reviewers:** TBD
**Implementation plan:** [multiplayer-implementation-plan.md](multiplayer-implementation-plan.md)

---

## Summary

NodeTool's workflow editor is single-writer. Two people who open the same workflow silently overwrite each other; the only concurrency mechanism we have is a coarse "this resource changed, refetch it" push that discards the loser's work. This doc proposes making the workflow canvas multiplayer: shared live editing with presence (cursors, selections), per-user undo, and convergent conflict resolution, built on a CRDT (Yjs) synchronized over our existing WebSocket server and persisted in our existing database.

The central architectural decision is that **the CRDT is an implementation detail of the editor, not a new source of truth for the platform**. The workflow's materialized `graph` JSON remains the interface for the runner, the REST/tRPC API, the CLI, version history, export, and validation. Everything outside the editor keeps working unchanged. That constraint is what makes this project a bounded, reversible investment rather than a rewrite.

Estimated cost: ~2 engineer-weeks for Phase 0 (presence + write-conflict safety), ~7 engineer-weeks for Phase 1 (CRDT co-editing). Phase 0 ships value on its own and is a prerequisite for nothing; if Phase 1 is cancelled, Phase 0 stands.

---

## 1. Context

NodeTool is a visual AI workflow platform: a React/ReactFlow editor over an actor-model execution kernel, deployed both as a desktop app (Electron, local single-user server) and as a hosted service (Fly.io, `api.nodetool.ai`). Over the last several quarters the platform grew the full perimeter of a collaborative product:

- **Hosted multi-user deployment** with auth and public/private workflow access (`packages/websocket/src/trpc/routers/workflows.ts`).
- **Version history** with manual and autosave snapshots (`packages/models/src/schema/workflow-versions.ts`, `web/src/components/version/`).
- **Sharing surfaces**: public workflows, mini-apps, portable `.nodetool` bundles.
- **A live push channel**: the server observes model changes and pushes resource-change events over WebSocket; the client invalidates TanStack Query caches (`web/src/stores/resourceChangeHandler.ts`).

What is missing is the center of that perimeter: two people cannot work on the same canvas. Saves are last-write-wins. There is no presence, no awareness, no merge. The resource-change channel makes this *worse* in one respect: user B's screen refetches and discards their in-progress edits when user A saves.

AI workflows are collaborative artifacts by nature — a prompt author, a domain expert, and an engineer iterating on the same graph is the normal working mode, not the exception. Every adjacent category has already internalized this (Figma for design canvases; n8n shipped collaborative editing for workflow graphs). For a product with a hosted offering, multiplayer is not a feature among features; it is the difference between a tool and a platform.

### 1.1 Current editing pipeline (what we'd be changing)

- Each open workflow gets its own Zustand store created by `createNodeStore` (`web/src/stores/NodeStore.ts`), holding ReactFlow `nodes`/`edges`. Undo/redo is client-local via the `zundo` temporal middleware.
- Saves go through tRPC mutations to the workflows router, which writes the whole `graph` JSON column. No optimistic-concurrency check: the write path accepts whatever graph the client sends.
- Version snapshots (`save_type: manual | autosave`) are rows in `nodetool_workflow_versions` keyed by workflow.
- All realtime traffic (runs, chat, resource changes) flows through one WebSocket (`/ws`, Fastify + `@fastify/websocket`, MsgPack frames) behind the client's `GlobalWebSocketManager` singleton.

These are good bones. The transport, auth, persistence, and versioning layers all exist; we are adding a synchronization layer, not infrastructure.

---

## 2. Goals

1. **G1 — Convergent co-editing.** N users edit the same workflow concurrently; all replicas converge to the same graph without lost updates. Target p95 remote-edit visibility < 500 ms on the hosted deployment.
2. **G2 — Presence.** Live cursors, selections, and a "who's here" roster, with join/leave latency < 2 s.
3. **G3 — Per-user undo.** Undo reverts *my* operations only, never a collaborator's.
4. **G4 — Zero blast radius outside the editor.** No changes to the execution kernel, REST/tRPC API shapes, CLI, DSL export, bundles, validation, or mini-apps. The materialized `graph` JSON remains authoritative for all of them.
5. **G5 — Runs on our actual infrastructure.** SQLite and Postgres schema parity, single-node Fly deployment, self-hostable with no new external services.
6. **G6 — Reversible rollout.** Feature-flagged; disabling the flag loses no data and returns to today's behavior.

### Non-goals

- **Collaborative text editing inside prompt fields** (character-level merge via Y.Text). Phase 2 candidate; v1 treats each property value as an atomic register.
- **Comments, annotations, follow-mode, emoji reactions.** Presence primitives make these cheap later; they are product work, not sync work.
- **Offline-first editing with deferred merge.** Desktop users editing purely local workflows are out of scope; collab requires a live connection to the owning server. (The CRDT gives us most of the machinery for this later; we are deliberately not paying the UX cost now.)
- **Horizontal scale-out of the sync server.** We run one Fly machine. The design documents the scale-out path (§7.4) but does not build it.
- **Shared execution sessions.** Runs stay per-user (per-user generations, per-user results). Broadcasting run *status* to collaborators is cheap and included; sharing run *outputs* across users touches asset ownership and is deferred.
- **A new permissions system.** We reuse `access: public | private` plus one additive collaborators table (§5.6). Org/team modeling is its own project.

---

## 3. Design overview

One page, top to bottom:

1. **Document model.** Each collaborative workflow has a Yjs `Y.Doc`: `nodes` and `edges` as `Y.Map`s keyed by id, node properties as nested `Y.Map`s with last-writer-wins leaf values. This mirrors the existing graph JSON one-to-one.
2. **Transport.** A new MsgPack message family (`collab_*`) on the existing `/ws` socket: join/leave, Yjs sync protocol (state vectors + updates), and awareness (presence) frames. No new port, no new server process, no new auth path.
3. **Server.** A `CollabRoomManager` in `packages/websocket`: one in-memory room per open workflow, holding the loaded `Y.Doc`, broadcasting updates to members, appending updates to the database, and periodically (a) compacting the update log into snapshots and (b) flushing the materialized `graph` JSON through the existing save path — which keeps versions, resource-change events, and every downstream consumer working untouched.
4. **Client.** A `YjsGraphBinding` that two-way binds the `Y.Doc` to the existing per-workflow `NodeStore`. ReactFlow and every component above it are unaware anything changed. Undo/redo switches from `zundo` to `Y.UndoManager` (scoped to local origin) when a workflow is in collab mode.
5. **Persistence.** Two additive tables: an append-only update log and periodic snapshots. Recovery = load latest snapshot + replay tail. The materialized JSON is always a valid fallback: worst case, we discard the CRDT state and re-seed it from `workflow.graph`, losing nothing but sub-second granularity.
6. **Phasing.**
   - **Phase 0 — Safety + presence (no CRDT).** Optimistic-concurrency check on workflow saves (reject stale writes instead of clobbering), presence roster + live cursors over an awareness channel, and a "someone else is editing" banner. Small, independently shippable, kills the silent-data-loss bug on day one.
   - **Phase 1 — CRDT co-editing.** Everything above.
   - **Phase 2 (sketch only).** Y.Text for prompt properties, comments, follow-mode, offline merge.

```
 ┌────────────┐   Yjs updates + awareness    ┌─────────────────────────┐
 │  Client A  │◄────────────────────────────►│  /ws  (existing socket) │
 │ NodeStore  │                              │  CollabRoomManager      │
 │  ▲  binding│                              │  ┌───────────────────┐  │
 │  Y.Doc     │                              │  │ Room: workflow_id │  │
 └────────────┘                              │  │  Y.Doc (memory)   │  │
 ┌────────────┐                              │  └───┬─────────┬─────┘  │
 │  Client B  │◄────────────────────────────►│      │         │        │
 └────────────┘                              └──────┼─────────┼────────┘
                                              append│         │debounced flush
                                                    ▼         ▼
                                        crdt_updates/     workflow.graph JSON
                                        crdt_snapshots    (unchanged interface:
                                        (new tables)       runner, API, versions,
                                                           export, validate, CLI)
```

---

## 4. Why a CRDT, and why Yjs

The decision that shapes everything else. Stating the reasoning explicitly because it's the part most likely to be re-litigated:

A workflow graph under concurrent editing has exactly the conflict profile CRDTs are good at: a keyed collection of objects (nodes, edges) where concurrent operations mostly touch *different* keys (you move your node, I edit my prompt), and where the rare same-key conflict has an acceptable arbitrary-but-deterministic resolution (last writer wins on a property value). We do not need server-ordered intent preservation (OT's strength, at the cost of a server that must serialize and transform every operation); we need convergence, offline-tolerant buffering during reconnects, and per-key merge — CRDT territory.

Yjs specifically, over Automerge: Yjs is the ecosystem default (mature, MIT, ~10 years of production use, the engine behind most collaborative ReactFlow implementations), has an order-of-magnitude edge in update size and apply throughput in public benchmarks, ships the awareness protocol we need for presence as a sibling package (`y-protocols`), and — decisive for us — its sync protocol is transport-agnostic bytes we can frame in MsgPack on our existing socket rather than adopting a new server. Automerge's nicer git-like history model buys us nothing here because version history already exists at the platform level.

The considered-and-rejected alternatives are in §8.

---

## 5. Detailed design

### 5.1 Document model

One `Y.Doc` per workflow. Top-level shared types:

```
doc.getMap('nodes')    // Y.Map<node_id → Y.Map>
doc.getMap('edges')    // Y.Map<edge_id → plain object (atomic)>
doc.getMap('meta')     // workflow-level fields editable in the canvas (name, description)
```

Per node (`Y.Map`):

| Key | Type | Conflict semantics |
|---|---|---|
| `type`, `parent_id` | plain value | LWW (rarely concurrent) |
| `position` | plain `{x,y}` value | LWW, whole-point (concurrent drags of the same node: one wins; visually fine) |
| `width`/`height`, `ui` state | plain values | LWW |
| `properties` | nested `Y.Map<prop → value>` | **LWW per property** — the case that matters. A edits `prompt` while B edits `temperature` on the same node: both survive. |

Edges are atomic values, not nested maps: an edge's identity *is* its endpoints, so "merging" two concurrent edits of one edge is meaningless — replace wholesale. Structural conflicts follow Yjs map semantics: concurrent delete-node vs. edit-node resolves to delete-wins (the map key is gone). The binding then garbage-collects edges referencing missing nodes inside the same transaction, preserving the graph invariant the kernel's `validateGraph` expects. This is the one invariant the CRDT cannot express by itself and must be enforced in the binding on every remote transaction — it gets a dedicated property-based test suite (§7.3).

Property values are the same JSON-serializable values stored in `graph` today, so `Y.Doc ⇄ graph JSON` conversion is mechanical and lossless in both directions (`docFromGraph`, `graphFromDoc` — pure functions, heavily unit-tested, shared between client and server via a new `packages/collab` workspace package).

**Not in the doc:** run results, generations, node execution state, selection. Execution state stays in `ResultsStore`/`LiveRunStore` and flows through existing run channels; selection is presence (ephemeral), not document state.

### 5.2 Wire protocol

New MsgPack frames on the existing `/ws` connection, multiplexed by workflow id. We reuse Yjs's binary sync protocol as an opaque payload — we frame it, we don't reimplement it.

| Message | Direction | Payload |
|---|---|---|
| `collab_join` | C→S | `{workflow_id}` — authz check, room attach |
| `collab_joined` | S→C | `{state_vector, snapshot, members[]}` |
| `collab_sync` | both | `{workflow_id, data: bytes}` — y-protocols sync1/sync2 (state-vector exchange → diff) |
| `collab_update` | both | `{workflow_id, update: bytes}` — incremental Yjs update; server rebroadcasts to other members and appends to log |
| `collab_awareness` | both | `{workflow_id, data: bytes}` — y-protocols awareness delta (cursor, selection, viewport, user meta). Ephemeral: never persisted, never ordered. |
| `collab_leave` | C→S | room detach; server broadcasts awareness removal |

Reconnect is the sync protocol's normal case: the client keeps its `Y.Doc`, reconnects, exchanges state vectors, and receives/sends exactly the missed diff. Edits made while disconnected are buffered in the local doc and merge on reconnect — short-outage tolerance falls out of the design for free (distinct from offline-first, which we are not doing; the buffer lives only as long as the tab).

Rate shaping at the client: position updates during drags are throttled to ~30 Hz and batched per Yjs transaction; awareness to ~15 Hz. Yjs batches transactions into single updates natively.

### 5.3 Server: `CollabRoomManager`

Lives in `packages/websocket`, wired into the unified socket runner next to the existing message handlers.

**Room lifecycle.** First `collab_join` for a workflow: load latest snapshot from `workflow_crdt_snapshots`, apply tail from `workflow_crdt_updates`; if neither exists (first-ever collab session), seed the doc from `workflow.graph` via `docFromGraph`. Last member leaves: flush, then evict after a 60 s grace period (fast rejoin skips the reload).

**On each update:** apply to the room doc, rebroadcast to other members, append the raw update to `workflow_crdt_updates` (append-only insert — cheap, safe on SQLite and Postgres).

**Compaction.** When a room's log exceeds 500 updates (or on eviction), encode the doc as a snapshot row and delete the covered updates, in one transaction. Back-of-envelope: a heavy session is ~10 updates/s sustained ⇒ compaction roughly every minute under load; snapshot for a 500-node workflow is O(100 KB); the log never grows unbounded.

**Materialized flush.** Debounced (2 s idle / 15 s max), the room writes `graphFromDoc(doc)` through the **existing** workflow save path. Consequences, all intentional:
- The `ModelObserver` → resource-change event fires as today, so non-collab clients (CLI, another user's read-only view, mini-apps) see updates at the granularity they already expect.
- Autosave version snapshots keep accruing in `nodetool_workflow_versions` with no changes to that system.
- A run started mid-session sees a graph at most ~2 s stale — identical to today's autosave behavior, and the run submit path can force a flush first (§5.7).

**Authority.** While a room is live, the room doc is authoritative and direct graph saves from collab-mode clients are suppressed (the binding replaces the save path). A non-collab writer (CLI `workflows run`-adjacent tooling, older client) that writes `workflow.graph` while a room is live is detected via the Phase 0 optimistic-concurrency token; the room responds by rebasing: diffing the incoming JSON against `graphFromDoc(doc)` and applying the delta as a Yjs transaction. This is the ugliest corner of the design; it is bounded, and the alternative (locking out the CLI) breaks G4.

### 5.4 Client: `YjsGraphBinding`

A per-workflow object owned by `WorkflowManagerStore`, created when a workflow opens in collab mode. Responsibilities:

- **Doc → store:** on remote transactions, translate changed keys into the minimal `NodeStore` mutation (add/remove/patch node or edge). ReactFlow, properties panels, and everything above the store are untouched — they already re-render from store changes.
- **Store → doc:** the store's mutation actions (add node, move node, change property, connect edge) additionally write into the `Y.Doc` inside a transaction tagged with a local origin. Origin tagging is what prevents echo loops (remote transactions don't re-enter the doc) and is what scopes undo.
- **Undo/redo:** `Y.UndoManager` tracking only local-origin transactions replaces the `zundo` temporal store while in collab mode. This is a real behavior change (undo history no longer survives a reload; a collaborator deleting the node you just edited makes your undo a no-op) — both are the industry-standard semantics and match user expectations from Figma/Google Docs.
- **Presence rendering:** awareness states drive remote cursors (canvas overlay), selection highlights (colored node outlines), and the avatar roster in the editor header. Each user gets a stable color derived from user id.

Single-user and local-desktop workflows do not create a binding and keep today's path bit-for-bit, including `zundo`. Yes, this is a dual code path (risk §9); the seam is one object with a narrow interface, and Phase 1 exit criteria include e2e coverage of both paths.

### 5.5 Presence & awareness

`y-protocols/awareness`, payload per user: `{user_id, name, color, cursor: {x,y} | null, selection: node_ids[], viewport?}`. Ephemeral by construction — 30 s timeout evicts crashed clients, nothing persisted, nothing in the doc. Presence ships in **Phase 0**, before the CRDT: the awareness channel has no dependency on shared document state, and "I can see you're here, and where" removes most accidental-conflict pain even before merges are automatic.

### 5.6 Permissions & sharing

Reuse the existing model, one additive table:

- `workflow_collaborators (workflow_id, user_id, role: editor | viewer, invited_by, created_at)` — SQLite and Postgres schemas, additive Drizzle migration.
- **Edit** (join room, send updates): owner + `editor` collaborators.
- **Observe** (join room read-only, receive updates + awareness, send only awareness): `viewer` collaborators; optionally public workflows (flag-gated — live-observing a public workflow is a great demo and a real load consideration; default off at launch).
- Authorization enforced at `collab_join` **and** per `collab_update` server-side (a viewer socket sending an update is dropped and logged). All room traffic rides the already-authenticated socket.

Invite UX (email/link) is product work layered on this table; out of scope for this doc beyond the schema.

### 5.7 Interaction with execution & caching

The rule: **runs consume the materialized JSON; the CRDT never touches the kernel.**

- Run submit from a collab client forces a room flush, then follows today's path. The kernel `WorkflowRunner`, actors, and the debug/validate CLI see an ordinary graph.
- Per-user run state is unchanged. Run *status* (node running/completed) is additionally mirrored into the initiating user's awareness state so collaborators see "Anna is running this branch" — cheap, ephemeral, no new channels.
- The editor's cached partial-run machinery (`runSubgraph.ts`, `computeRunSignatures.ts`, generations) already keys reuse off input signatures of current graph state; remote edits dirty signatures exactly like local edits. No changes, but this interaction gets explicit e2e coverage because it's subtle: a collaborator editing an upstream node must invalidate my "run from here" cache, and signature hashing makes that automatic.

### 5.8 Version history

Unchanged and load-bearing. Autosaves continue via the materialized flush; manual "save version" works from any collaborator. Version restore while a room is live is implemented as a room-level operation: server rebases the restored graph onto the doc as one transaction (same mechanism as §5.3 external-writer rebase), so a restore doesn't fork the room. Versions remain our coarse-grained, human-meaningful history; the CRDT update log is fine-grained machinery, not a user-facing timeline (per-user attribution of changes *is* recorded in update metadata, so a future "who changed this node" feature has the data it needs).

### 5.9 Failure modes

| Failure | Behavior |
|---|---|
| Server restart / deploy | Rooms are memory; clients reconnect, rooms lazily reload from snapshot+log. In-flight updates not yet appended are re-sent by clients via sync (client docs hold full state). Worst case loss: none, by protocol. |
| Client crash mid-edit | Their unflushed local ops are lost (same as today); doc consistent. Awareness timeout clears their cursor. |
| Divergence bug (binding or protocol defect) | Detection: clients periodically send a state-vector hash; mismatch → client discards local doc and re-syncs from server (server wins), incident logged with both docs' encoded state attached. |
| Corrupt/unloadable CRDT state | Drop snapshot+log for that workflow, re-seed from `workflow.graph`. Loses at most the last flush interval (≤15 s) of granularity, never the graph. This is the design's ultimate safety property and the reason G4 exists. |
| Log growth (compaction failing) | Alert at 10× threshold; room degrades to read-only presence rather than unbounded writes. |

---

## 6. Rollout

- **Flag:** `collab` (server setting + per-workspace override). Off = today's behavior exactly; Phase 0's stale-write rejection ships behind its own sub-flag first since it changes save semantics for racing writers (from "silently clobber" to "second writer gets a conflict prompt" — strictly better, but a visible change).
- **Phase 0 (≈2 eng-weeks):** optimistic-concurrency token on workflow saves; awareness channel; presence UI (roster, cursors, "N others editing" banner). Dogfood on the team's own hosted workspace.
- **Phase 1 (≈7 eng-weeks):** `packages/collab` (doc model + conversions, property-based tests), server room manager + persistence + compaction, client binding + undo swap, permissions table, e2e suite. Dogfood ≥2 weeks; exit criteria: zero divergence incidents, p95 edit latency <500 ms, both editor code paths green in CI.
- **GA:** default-on for hosted; self-hosters get it via normal upgrade; desktop-vs-cloud unchanged (local workflows never enter collab mode).
- **Kill switch:** disabling the flag stops room creation; materialized JSON is current to within the flush interval, so rollback is a no-op for data.

**Observability:** OTel spans for room lifecycle and sync (`collab.room.load`, `collab.update.apply`); metrics: concurrent rooms, members/room, update rate, broadcast fan-out latency, compaction duration, divergence count (this one pages), flush lag. All through the existing tracing stack (`NODETOOL_TRACE_FILE` et al.).

**Testing:** property-based convergence tests on the doc model (random concurrent op interleavings ⇒ identical `graphFromDoc` output, graph invariants hold); fuzzed delete-vs-edit races for the edge-GC invariant; multi-context Playwright e2e (two browsers, one workflow: edit propagation, cursor rendering, conflict cases, undo isolation, reconnect); chaos tests reordering/dropping/duplicating update frames at the transport seam.

---

## 7. Scale & capacity (back of envelope)

Hosted deployment today: one Fly machine, hundreds of users, tens concurrent. Numbers for 50 concurrent rooms × 4 members, heavy editing (10 updates/s/room, ~150 B/update): broadcast egress ≈ 50 × 10 × 3 × 150 B ≈ **225 KB/s** — noise. Memory: 50 loaded docs × O(1 MB) worst case ≈ 50 MB — fine. DB: 500 inserts/s worst-burst append-only — fine on Postgres; on SQLite, batched in the room's write loop (single writer per process anyway). CPU: Yjs applies are microseconds.

The binding constraint is **rooms are process-local**, so multiplayer requires all members of a room on one machine. Single machine today ⇒ non-issue. The documented scale-out path, when needed: consistent-hash workflow_id → machine (Fly-Replay header routing), which preserves the room-per-process model without a Redis/pubsub layer. Explicitly not built now.

---

## 8. Alternatives considered

**A. Per-node locking ("check out" a node) + today's refetch.** Simple, and some enterprise tools live with it. Rejected: locks rot (crashed clients, forgotten sessions), pessimistic UX at exactly the granularity people collide least, doesn't solve the whole-workflow save race, and builds no foundation for anything in Phase 2. We'd pay UX cost forever for a dead end.

**B. Rebroadcast Zustand actions (naive event sync).** Tempting because the store already exists. Rejected: no convergence guarantee under reorder/loss/reconnect — this is the architecture that produces ghost edges and split-brain canvases, and then you rebuild a worse CRDT case by case. Listed because someone always proposes it.

**C. Operational Transformation.** Proven (Docs), but requires the server to serialize and transform every op with per-type transform functions — high-complexity server code for a graph type nobody has a battle-tested OT library for. CRDTs give convergence with an off-the-shelf, transport-agnostic library. Rejected on build-cost and risk.

**D. Automerge instead of Yjs.** Credible; better history ergonomics. Rejected on update-size/throughput (order-of-magnitude in public benchmarks), smaller production footprint for canvas apps, and because its git-like history duplicates what our version system already provides.

**E. Hosted sync service (Liveblocks, PartyKit, etc.).** Fastest path on the hosted product. Rejected on a product invariant: NodeTool is self-hostable (desktop, docker-compose, `packages/deploy`), and a collaboration feature that only works on our cloud — or that ships customer workflow content to a third party — breaks that promise. Yjs costs us the room manager (§5.3), which at our scale is small.

**F. CRDT as the sole source of truth (drop the JSON graph).** Architecturally purer; rejected emphatically. It couples the kernel, API, CLI, exports, and versioning to the CRDT library, makes rollback a migration instead of a flag flip, and turns a 9-week project into a rewrite. The materialized-view pattern (§5.3) is the load-bearing decision of this doc.

---

## 9. Risks & open questions

- **Dual editor code path** (collab vs. solo binding, `Y.UndoManager` vs. `zundo`) is the top maintenance risk. Mitigation: narrow seam, both paths in CI. Open question for post-GA: converge solo mode onto a local-only Y.Doc to delete the fork.
- **External-writer rebase (§5.3)** is the fiddliest logic. Mitigation: it degrades safely (worst case equals today's last-write-wins for that one write) and is fuzz-tested.
- **ReactFlow render cost under remote-update storms** (many nodes patched at 30 Hz). Mitigation: transaction batching + rAF coalescing in the binding; perf budget test with a 500-node graph and a simulated 4-editor storm.
- **SQLite write contention** on busy self-hosted single-file DBs. Mitigation: batched appends, compaction thresholds; needs measurement in dogfood, not speculation.
- **Open:** do public workflows allow anonymous *observers* at GA, or authenticated-only? (Load and abuse surface vs. shareability. Default: authenticated-only, revisit with data.)
- **Open:** awareness on mobile (`mobile/` app is read-mostly today) — roster yes, cursors probably meaningless. Decide during Phase 0 UI work.

---

## Appendix A — Schema sketch (Drizzle, additive)

```
workflow_crdt_updates   (id, workflow_id, seq, update BLOB, user_id, created_at)
                        index (workflow_id, seq)
workflow_crdt_snapshots (id, workflow_id, seq_through, snapshot BLOB, created_at)
                        index (workflow_id, seq_through desc)
workflow_collaborators  (workflow_id, user_id, role, invited_by, created_at)
                        pk (workflow_id, user_id)
```

Mirrored in `schema/` and `schema-pg/`; migration is additive only — no changes to `workflows` or `nodetool_workflow_versions`.

## Appendix B — Glossary

- **CRDT** — Conflict-free Replicated Data Type: data structures whose concurrent edits merge deterministically without coordination.
- **Awareness** — Yjs's ephemeral presence side-channel: per-client state (cursor, selection) that is broadcast but never part of the document.
- **State vector** — compact summary of "which updates a replica has," used to compute the minimal diff on (re)connect.
- **LWW** — last-writer-wins register semantics for a single value.
- **Materialized flush** — writing `graphFromDoc(doc)` into the existing `workflow.graph` column so non-collab consumers stay oblivious.
