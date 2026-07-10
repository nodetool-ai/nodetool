# Triggers as Wake-Up Calls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Write the failing test before the implementation for every task that touches runtime behavior. Run `npm run check` before each commit. Each task carries a **Model:** line — spawn its subagent with that model.

**Subagent model assignments.** Rationale: `claude-fable-5` for the two tasks that change kernel execution semantics or refactor `unified-websocket-runner.ts`; `claude-opus-4-8` for concurrency-, idempotency-, and security-sensitive services; `claude-sonnet-5` for well-specified feature work; `claude-haiku-4-5` for transcription-grade tasks. Reviews of fable/opus tasks should not use a smaller model than the author.

| Model | Tasks |
|---|---|
| `claude-fable-5` | 6 (kernel trigger entry point), 7 (headless job start) |
| `claude-opus-4-8` | 3 (store extraction + inbox seq), 8 (dispatcher), 9 (webhook route), 11 (boot wiring + deletion) |
| `claude-sonnet-5` | 2, 4, 5, 10, 12, 13, 15 |
| `claude-haiku-4-5` | 1 (schema transcription), 14 (single tRPC endpoint) |

**Goal:** A trigger fires when its workflow is not running: the event is stored durably, a run starts, and the trigger node emits the event payload. Registrations and pending events survive server restarts (cloud) and app downtime (Electron).

**Design spec:** [2026-07-10-trigger-wakeup-redesign.md](../specs/2026-07-10-trigger-wakeup-redesign.md). Read it first — this plan implements its phases 1–3. Phases 4 (resume mode) and 5 (Telegram/Discord source adapters) get their own plans once this lands.

**Architecture:** Trigger nodes compile to `trigger_registrations` rows on activation. Host-owned ingestion adapters (webhook route, scheduler, file watcher) run inside the backend server process — Electron spawns that same server (`electron/src/server.ts:477`), so desktop gets the adapters for free while the app is open. Adapters append durable, idempotent `trigger_inputs`; a dispatcher consumes them and starts one run per event through a headless job-start path, passing the payload as `trigger_event`. At run time the trigger node emits the payload and completes instead of listening.

**Decisions taken (defaults from the spec, revisit in review):**

- New-run-per-event is the only dispatch mode in this plan; resume is phase 4.
- Activation state lives only in `trigger_registrations` (enabled rows = active). No new workflow column.
- `WebhookTriggerNode`'s embedded `http.createServer` stays for the in-editor live-test path; production events come through the server route.
- Overdue schedules fire once on catch-up, not N times. Poll cursors (phase 5) catch up fully.
- `TriggerWorkflowManager` (`packages/kernel/src/trigger-manager.ts`) is deleted in the cleanup task — it manages the standing-job model this plan removes.

---

## File structure

- `packages/models/src/schema/trigger-inputs.ts` *(new)* — Drizzle schema over the already-migrated `trigger_inputs` table (`migrations/versions.ts:602`)
- `packages/models/src/schema/run-inbox-messages.ts` *(new)* — Drizzle schema over `run_inbox_messages` (`versions.ts:556`)
- `packages/models/src/schema/trigger-registrations.ts` *(new)* — new table
- `packages/models/src/trigger-input.ts`, `run-inbox-message.ts`, `trigger-registration.ts` *(new)* — model classes following `job.ts`
- `packages/models/src/migrations/versions.ts` — append migration `20260710_000000` (create `trigger_registrations`)
- `packages/kernel/src/trigger-wakeup.ts` — extract `TriggerInputStore` interface; keep memory store as default
- `packages/kernel/src/durable-inbox.ts` — unchanged interface; DB store lives in websocket
- `packages/kernel/src/runner.ts` — `trigger_event` on `RunJobRequest` (:125)
- `packages/kernel/src/actor.ts` — trigger-event branch in `_runImpl` (:309)
- `packages/kernel/src/trigger-manager.ts` *(delete, cleanup task)*
- `packages/protocol/src/api-types.ts` — `trigger_event` on `RunJobRequest` (:818)
- `packages/node-sdk/src/base-node.ts` — `static isTrigger` (:206 area), `emitTriggerEvent()` (:421 area), `toDescriptor()` (:548)
- `packages/node-sdk/src/node-metadata.ts`, `metadata.ts` — propagate `is_trigger`
- `packages/runtime/src/context.ts` — `triggerEvent` on `ProcessingContext` opts (:957)
- `packages/automation-nodes/src/nodes/triggers.ts` — mark nodes `isTrigger`, implement `emitTriggerEvent`
- `packages/websocket/src/triggers/stores.ts` *(new)* — `DrizzleTriggerInputStore`, `DrizzleDurableInboxStore`
- `packages/websocket/src/triggers/registration-sync.ts` *(new)* — graph → registrations diff on save/activate
- `packages/websocket/src/triggers/dispatcher.ts` *(new)* — consume inputs, start runs
- `packages/websocket/src/triggers/scheduler.ts` *(new)* — interval/schedule adapter
- `packages/websocket/src/triggers/file-watch.ts` *(new)* — fs.watch adapter + snapshot diff
- `packages/websocket/src/triggers/webhook-route.ts` *(new)* — `POST /api/webhooks/:token`
- `packages/websocket/src/headless-job-runner.ts` *(new)* — start a job without a WebSocket connection
- `packages/websocket/src/server.ts` — public-route allowlist (:779), boot wiring (:1290), shutdown (:1303)
- `packages/websocket/src/http-api.ts` — replace trigger stubs (:1677) with registration-backed handlers
- `packages/websocket/src/trpc/routers/workflows.ts` — registration sync in `update`/`create` (:489, :436); new `triggers` procedures
- `web/src/…` — Activate toggle + active-trigger status (task 15)

---

## Phase 1 — Durable foundation

### Task 1: Drizzle schemas and model classes for the migrated tables

**Model:** `claude-haiku-4-5`

**Files:** New: `packages/models/src/schema/trigger-inputs.ts`, `schema/run-inbox-messages.ts`, `src/trigger-input.ts`, `src/run-inbox-message.ts`. Modify: `schema/index.ts`, `src/index.ts`. Test: `packages/models/tests/trigger-input.test.ts`, `run-inbox-message.test.ts`.

- [ ] **Step 1: Write the failing test** — `TriggerInput.create(...)` round-trips all columns of `trigger_inputs` (`input_id` unique, `processed` default 0, `cursor` nullable); `TriggerInput.findUnprocessed(limit)` returns only `processed = 0` rows oldest-first; `markProcessed(inputId)` sets `processed`/`processed_at`. Same shape for `RunInboxMessage` (`message_id` unique, `msg_seq`, `status`).
- [ ] **Step 2: Run to verify FAIL** — `npm run test --workspace=packages/models -- trigger-input`.
- [ ] **Step 3: Implement** — schema columns must match the raw SQL in `versions.ts:556-635` exactly (the tables already exist in user databases; a mismatched Drizzle schema corrupts nothing but breaks queries). Model classes follow `job.ts:25`: `extends DBModel`, `static override table`, defaults with `??=` and `createTimeOrderedUuid()`.
- [ ] **Step 4: Postgres parity** — mirror both schemas in `packages/models/src/schema-pg/`.

### Task 2: `trigger_registrations` table + model

**Model:** `claude-sonnet-5`

**Files:** New: `schema/trigger-registrations.ts`, `src/trigger-registration.ts`. Modify: `migrations/versions.ts` (append `20260710_000000`), `schema/index.ts`, `src/index.ts`. Test: `packages/models/tests/trigger-registration.test.ts`, extend `migrations.test.ts`.

- [ ] **Step 1: Write the failing test** — create/find/update a registration; `TriggerRegistration.findEnabledByKind("schedule")`; `findByWorkflow(workflowId)`; unique constraint on `(workflow_id, node_id)`.
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement** — columns per spec: `id`, `user_id`, `workflow_id`, `node_id`, `kind`, `config_json` (via `jsonText<T>()`), `enabled` int, `cursor`, `last_fired_at`, `last_error`, `created_at`, `updated_at`; indexes on `(workflow_id)`, `(kind, enabled)`. Migration guarded with `db.tableExists()` per the convention at `versions.ts:1706`. `down()` drops the table.

### Task 3: DB-backed stores for kernel primitives

**Model:** `claude-opus-4-8`

**Files:** Modify: `packages/kernel/src/trigger-wakeup.ts`. New: `packages/websocket/src/triggers/stores.ts`. Test: `packages/kernel/tests/trigger-wakeup.test.ts` (extend), `packages/websocket/tests/trigger-stores.test.ts`.

- [ ] **Step 1: Extract `TriggerInputStore`** — interface (`insertIfAbsent`, `findUnprocessed`, `markProcessed`, `cleanupProcessed`) in `trigger-wakeup.ts`; today's in-memory array becomes `MemoryTriggerInputStore`, the default. `TriggerWakeupService` behavior unchanged — existing kernel tests must stay green with no edits.
- [ ] **Step 2: Write the failing store tests** — `DrizzleTriggerInputStore` satisfies the interface against a temp SQLite DB; duplicate `input_id` returns "already exists" instead of throwing. `DrizzleDurableInboxStore implements DurableInboxStore` (`kernel/src/durable-inbox.ts:63`) over `run_inbox_messages`: `append` preserves `msg_seq` ordering, `getMaxSeq` correct after restart (new store instance, same DB file).
- [ ] **Step 3: Implement** in `websocket/src/triggers/stores.ts` using the Task 1 models. Kernel gains no models dependency (would invert the package order `models → kernel` — kernel stays store-agnostic).

### Task 4: Registration sync on workflow save + real trigger endpoints

**Model:** `claude-sonnet-5`

**Files:** New: `packages/websocket/src/triggers/registration-sync.ts`. Modify: `trpc/routers/workflows.ts` (:489 `update`, :436 `create`), `http-api.ts` (:1677-1712), `routes/jobs.ts`. Test: `packages/websocket/tests/registration-sync.test.ts`.

- [ ] **Step 1: Write the failing tests** — `syncRegistrations(workflow, {enabled})`: graph with a `nodetool.triggers.IntervalTrigger` node produces one `kind: "schedule"` row with the node's props snapshotted into `config_json`; re-sync after node deletion removes the row; re-sync after prop change updates `config_json` and resets `cursor`; `enabled: false` disables all rows without deleting cursors. Kind mapping: `WebhookTrigger → webhook`, `IntervalTrigger → schedule`, `FileWatchTrigger → file_watch`, `ManualTrigger → manual` (no adapter; dispatched via API only). Webhook registrations get a generated URL token and a hashed secret in `config_json`.
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement** — call sync from the `update` mutation after `existing.save()` (workflows.ts:519) and from `create`. Detection reuses the `includes("triggers.")` predicate from `Workflow.hasTriggerNodes()` (`models/src/workflow.ts:89`) extended to a type→kind map.
- [ ] **Step 4: Replace the REST stubs** — `GET /api/jobs/triggers/running` lists enabled registrations with `last_fired_at`/`last_error` (no longer 501); `POST …/:id/start|stop` toggles `enabled`. Emit the existing `TriggerRegistered` run-event type (`models/src/run-event.ts`) on enable.

---

## Phase 2 — Cloud wake-up

### Task 5: `trigger_event` through protocol, kernel, and context

**Model:** `claude-sonnet-5`

**Files:** Modify: `protocol/src/api-types.ts:818`, `kernel/src/runner.ts:125`, `runtime/src/context.ts:957`. Test: extend `kernel/tests/runner-node-validation.test.ts` neighbors.

- [ ] **Step 1: Failing test** — a `RunJobRequest` with `trigger_event: { node_id, payload, input_id }` reaches the actor: `ProcessingContext` (or the descriptor handed to the actor) exposes it.
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement** — optional field, typed `{ node_id: string; payload: unknown; input_id: string }`. `npm run build:packages` after protocol changes (decorator packages load from `dist/`).

### Task 6: `isTrigger` flag and the `emitTriggerEvent` entry point

**Model:** `claude-fable-5`

**Files:** Modify: `node-sdk/src/base-node.ts`, `node-metadata.ts:285`, `metadata.ts:68`, `kernel/src/actor.ts:309`. Test: `kernel/tests/trigger-event-entry.test.ts` *(new)*, `node-sdk/tests/integration.test.ts` (metadata propagation).

- [ ] **Step 1: Failing tests** — (a) a node class with `static isTrigger = true` surfaces `is_trigger: true` in `metadata()` and `toDescriptor()`; (b) kernel e2e (pattern from `kernel/tests/e2e/helpers.ts`): running a graph whose trigger node has a matching `trigger_event` calls `emitTriggerEvent` once, emits the payload on the node's outputs, completes the run — `genProcess` is never entered; (c) the same graph run *without* `trigger_event` falls through to today's streaming path (live-test mode preserved).
- [ ] **Step 2: Verify FAIL** — `npm run test --workspace=packages/kernel -- trigger-event-entry`.
- [ ] **Step 3: Implement** — `BaseNode`: `static readonly isTrigger = false` and `async emitTriggerEvent(event, outputs)` default that emits `event.payload` keys onto declared output slots. Actor `_runImpl` (:309): before the `is_streaming_input` branch, `if (this.node.is_trigger && ctx.triggerEvent?.node_id === this.id)` → run the entry point and return.
- [ ] **Step 4: Mark the nodes** — `IntervalTriggerNode`, `WebhookTriggerNode`, `FileWatchTriggerNode`, `ManualTriggerNode` get `isTrigger = true` plus per-node `emitTriggerEvent` mapping payload → their declared output slots (webhook: `body`/`headers`/`query`/…; interval: synthesized `tick`/`timestamp`; file-watch: `event`/`path`/…). `npm run build:packages` (automation-nodes loads from `dist/`).

### Task 7: Headless job start

**Model:** `claude-fable-5`

**Files:** New: `packages/websocket/src/headless-job-runner.ts`. Test: `packages/websocket/tests/headless-job-runner.test.ts`.

- [ ] **Step 1: Failing test** — `startHeadlessJob({ workflowId, userId, triggerEvent })` creates a `Job` row, runs the graph through the kernel `WorkflowRunner`, resolves with the terminal status; the job is visible via `Job.find` while running (shows up in the existing jobs UI/tRPC list).
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement** — job start is currently WS-only (`UnifiedWebSocketRunner.runJob`, per-connection). Extract the minimal load-graph → `Job.create` → `new WorkflowRunner` → persist-terminal-status path into a function both the dispatcher and (later) an HTTP run route can call. Follow the CLI's headless run (`packages/cli`, `workflows run`) for graph hydration; reuse the runner's message persistence hooks where they're already factored out. If extraction from `unified-websocket-runner.ts` turns into a large refactor, stop and split it into its own task — do not inline a second job-execution implementation.

### Task 8: Dispatcher

**Model:** `claude-opus-4-8`

**Files:** New: `packages/websocket/src/triggers/dispatcher.ts`. Test: `packages/websocket/tests/trigger-dispatcher.test.ts`.

- [ ] **Step 1: Failing tests** — with a stubbed `startJob`: (a) an unprocessed `trigger_input` for an enabled registration starts exactly one run with `trigger_event` set, then marks the input processed; (b) `startJob` rejection leaves the input unprocessed (redelivered next tick) and writes `last_error` on the registration; (c) input for a disabled registration is skipped, left unprocessed; (d) concurrency `queue` policy: second event for the same registration waits for the first run; `skip` policy: it's marked processed without a run; (e) idempotency: dispatching twice never double-starts (input marked before-vs-after crash window documented — mark *after* run acceptance).
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement** — `startDispatcher({ store, startJob, intervalMs })` returning a stop fn (the `startReaper` shape, `server.ts:1290`). Poll loop plus an in-process `notify()` adapters call after appending, so same-process events dispatch immediately and the poll is only the crash-recovery path. Emit `TriggerInputReceived` run events. Default policy `parallel`, per-registration override from `config_json.concurrency`.

### Task 9: Webhook ingestion route

**Model:** `claude-opus-4-8`

**Files:** New: `packages/websocket/src/triggers/webhook-route.ts`. Modify: `server.ts:779` (public allowlist). Test: `packages/websocket/tests/webhook-route.test.ts`.

- [ ] **Step 1: Failing tests** — `POST /api/webhooks/:token` with the registration's secret header: 200, one `trigger_input` appended with `{body, headers, query, method}` payload, dispatcher notified. Wrong/missing secret: 401, nothing stored. Unknown token: 404. Disabled registration: 410. Duplicate delivery with same idempotency key (`x-webhook-id` header when present, else hash of token+body+minute): one input. Route reachable **without a session** (no `Authorization` header) — this is the regression the allowlist test pins.
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement** — add `pathname.startsWith("/api/webhooks/")` to the public-route allowlist (`server.ts:779`, precedent: `/api/oauth/*`); authenticate in the handler by comparing the hashed secret from `config_json` (constant-time compare). Cap body size; store raw string when not JSON.

### Task 10: Scheduler adapter

**Model:** `claude-sonnet-5`

**Files:** New: `packages/websocket/src/triggers/scheduler.ts`. Test: `packages/websocket/tests/trigger-scheduler.test.ts` (fake timers).

- [ ] **Step 1: Failing tests** — enabled `schedule` registration with `interval_seconds: 60`: fires at t+60 with a synthesized tick payload, updates `last_fired_at`; config change picked up on next tick (re-read registrations each sweep, no restart needed); **catch-up**: registration whose `last_fired_at` is 10 intervals ago fires exactly once on scheduler start; disabled registration never fires.
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement** — one sweep timer (coarse, e.g. every 5s) computing due registrations from `last_fired_at + interval`, not one `setTimeout` per registration; appends `trigger_inputs` with `input_id = "${registrationId}:${dueTickIndex}"` so a crash between fire and mark cannot double-fire. `emit_on_start`/`initial_delay` honored from `config_json`.

### Task 11: Boot wiring and cleanup

**Model:** `claude-opus-4-8`

**Files:** Modify: `packages/websocket/src/server.ts` (:1290 boot, :1303 shutdown). Delete: `packages/kernel/src/trigger-manager.ts` + its tests + `index.ts` exports. Test: extend `packages/websocket/tests/child-shutdown.test.ts` pattern.

- [ ] **Step 1: Wire** — after `app.listen`: construct Drizzle stores, `TriggerWakeupService`, dispatcher, scheduler, file-watch adapter (Task 12); on boot, dispatch any backlog of unprocessed `trigger_inputs`. `shutdown()` stops all of them before `app.close()`.
- [ ] **Step 2: Failing test** — server start/stop cycle leaves no open timers/watchers (vitest `--reporter` hang check); backlog input present at boot produces a run.
- [ ] **Step 3: Delete `TriggerWorkflowManager`** — nothing outside tests references it (audit 2026-07-10). Remove exports from `kernel/src/index.ts:59-77` for it only; `TriggerState`/`TriggerWakeupService` stay.
- [ ] **Step 4:** `npm run check`.

---

## Phase 3 — Electron and catch-up

### Task 12: File-watch adapter

**Model:** `claude-sonnet-5`

**Files:** New: `packages/websocket/src/triggers/file-watch.ts`. Test: `packages/websocket/tests/trigger-file-watch.test.ts` (tmp dirs).

- [ ] **Step 1: Failing tests** — enabled `file_watch` registration: creating a matching file appends a `trigger_input` with `{event: "created", path}`; ignore patterns and debounce honored (reuse the matching/debounce logic from `FileWatchTriggerNode`, extracted to a shared helper rather than duplicated); registration disabled → watcher closed.
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement** — runs in the backend server like every other adapter (the Electron app spawns that server, `electron/src/server.ts:477`, so no electron-main code is needed). Skip registrations whose path doesn't exist; record `last_error`.

### Task 13: Downtime catch-up

**Model:** `claude-sonnet-5`

**Files:** Modify: `triggers/file-watch.ts`, `triggers/scheduler.ts` (covered by Task 10's catch-up test). Test: extend `trigger-file-watch.test.ts`.

- [ ] **Step 1: Failing test** — file-watch registration with `config_json.catch_up: true`: adapter persists a `{path → mtime}` snapshot into `cursor` on stop; on next start, a file modified in between synthesizes one `modified` event before live watching begins. Default (`catch_up` absent): no snapshot, no synthesized events.
- [ ] **Step 2: Verify FAIL.**
- [ ] **Step 3: Implement** — snapshot capped (e.g. 10k entries) with `last_error` note when exceeded. Schedule catch-up already ships in Task 10; poll-cursor catch-up arrives with phase 5 adapters.

### Task 14: Manual dispatch API

**Model:** `claude-haiku-4-5`

**Files:** Modify: `trpc/routers/workflows.ts` or new `trpc/routers/triggers.ts`. Test: router test.

- [ ] **Step 1: Failing test** — `triggers.fire({ workflowId, nodeId, payload })` (protectedProcedure, ownership-checked) appends a `trigger_input` and returns the started `job_id`. This is the `manual` kind's only path and doubles as the "Run now" button for any registration.
- [ ] **Step 2: Verify FAIL, then implement.**

### Task 15: Web UI — Activate toggle and trigger status

**Model:** `claude-sonnet-5`

**Files:** `web/src` — editor toolbar component, new TanStack Query hooks over the Task 4/14 endpoints. Test: RTL tests per web conventions.

- [ ] **Step 1:** Activate/Deactivate toggle on workflows where the graph has trigger nodes; shows enabled state from registrations. Uses `ui_primitives` only; TanStack Query with hierarchical keys (`["triggers", workflowId]`), `enabled:` gating on graph having trigger nodes.
- [ ] **Step 2:** Per-trigger status row: kind, `last_fired_at`, `last_error`, webhook URL with copy button (token URL from registration).
- [ ] **Step 3:** "Fire now" button → `triggers.fire`.

---

## Verification

- Per-package: `npm run test --workspace=packages/<name>`; affected set via `npm run dev:nodetool -- affected`.
- End-to-end (after Task 11): start `npm run dev:server`, save+activate a workflow with a `WebhookTrigger`, `curl -X POST http://localhost:7777/api/webhooks/<token> -H 'x-webhook-secret: …' -d '{"hello":1}'` with **no run in progress**, confirm a job appears in `npm run dev:nodetool -- jobs list` and the trigger node's outputs carry the body. Restart the server with an undelivered input in the DB and confirm it dispatches on boot.
- `npm run check` before every commit.

## Explicitly deferred

- **Resume mode** (spec phase 4): wiring `setResumingState`, inactivity suspension via `TriggerState`, dispatcher resume branch. Depends on this plan's durable inbox store.
- **Telegram/Discord/IMAP poll adapters** (spec phase 5): replace the token-validation stubs in `integration-nodes/src/nodes/messaging.ts`; per-registration `cursor` column is already in place.
- **Cloud webhook relay for desktop** (webhooks received while the laptop is closed): needs account-scoped queueing on the Fly server plus a desktop drain protocol — separate design.
