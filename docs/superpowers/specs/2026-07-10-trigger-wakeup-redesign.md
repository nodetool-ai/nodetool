# Triggers as Wake-Up Calls — Design Spec

**Date:** 2026-07-10
**Status:** Draft for review
**Related:** [suspendable nodes](../../developer/suspendable-nodes.md); `packages/kernel/src/trigger*.ts`; `packages/automation-nodes/src/nodes/triggers.ts`

## Problem

Today a trigger only works while its workflow is already running. Trigger nodes
are long-lived streaming actors: `IntervalTrigger`, `WebhookTrigger`, and
`FileWatchTrigger` loop inside `genProcess()`, and `ManualTrigger` drains its
inbox via `run()` (`packages/automation-nodes/src/nodes/triggers.ts`). The
kernel has no trigger concept at all — it just keeps a streaming node's actor
alive (`packages/kernel/src/actor.ts:310`, `:1064`). If no job is running,
events fall on the floor.

That model fails both deployment targets:

- **Cloud (Fly).** A job lives in the `UnifiedWebSocketRunner`'s in-memory
  `activeJobs` map and dies on every deploy or crash. Nothing restarts it.
  `WebhookTriggerNode` binds its own `http.createServer` on a private port —
  unreachable behind Fly's single exposed port, and a port-collision hazard
  between workflows.
- **Electron.** The app is closed or asleep most of the day. A trigger that
  only observes events while an actor is spinning misses everything that
  happened while the app was down, and burns resources while it is up.

The user-visible requirement: **every trigger should act as a wake-up call** —
an event arrives, the platform starts (or resumes) the workflow and hands it
the event. The workflow should not need to be running to be triggered.

### What exists and what is wired

An audit of the current code (2026-07-10) found the system half-ported from the
Python backend. Wired and working:

| Piece | Where | Status |
|---|---|---|
| Streaming trigger nodes (interval, webhook, file-watch, manual) | `automation-nodes/src/nodes/triggers.ts` | works, but only inside a live job |
| Suspension: `WorkflowSuspendedError` thrown → actor catches → job row persisted | `kernel/src/suspendable.ts:130`, `kernel/src/actor.ts:431`, `websocket/src/unified-websocket-runner.ts:2388` | persists `suspended_node_id`, `suspension_state_json` on `Job` |
| `pushInputValue` RPC feeding a running job's inbox | `unified-websocket-runner.ts:5889` | works (drives `ManualTrigger`) |

Defined but never called from non-test code (dead ports of
`trigger_workflow_manager.py` / `trigger_wakeup_service.py` /
`trigger_node.py`):

| Piece | Where | Gap |
|---|---|---|
| `TriggerWorkflowManager` (start/stop/watchdog) | `kernel/src/trigger-manager.ts` | never instantiated |
| `TriggerWakeupService` (durable, idempotent trigger inputs) | `kernel/src/trigger-wakeup.ts` | never instantiated |
| `TriggerState` (inactivity timeout → suspend) | `kernel/src/trigger.ts` | never instantiated |
| Resume: `setResumingState` / `getSavedState` | `kernel/src/suspendable.ts:158` | nothing reads `suspension_state_json` back or re-executes a suspended run |
| `Workflow.hasTriggerNodes()` | `models/src/workflow.ts:89` | never called |
| Run-event types `RunSuspended`, `TriggerRegistered`, `TriggerInputReceived`, `TriggerCursorAdvanced` | `models/src/run-event.ts:19-37` | never emitted |
| `run_inbox_messages`, `trigger_inputs` tables | `models/src/migrations/versions.ts:554-635` | migrated, but no Drizzle schema and no store reads them; `DurableInbox` has only `MemoryDurableInboxStore` |
| Trigger REST routes | `websocket/src/http-api.ts:1677-1712` | return `[]` / HTTP 501 |
| `DiscordBotTrigger`, `TelegramBotTrigger` | `integration-nodes/src/nodes/messaging.ts:7`, `:220` | validate the token once and return; no gateway/long-poll loop |

There is no scheduler, no server-side webhook ingestion route, and no Electron
trigger surface anywhere in the repo.

## Goal

1. A trigger fires when its workflow is **not running**: the event is stored
   durably, a run starts (or resumes), and the trigger node emits the event
   payload.
2. Works in **cloud mode**: events enter through the main server port,
   registrations and pending events survive restarts and deploys.
3. Works in **Electron**: listeners run while the app is open; events that
   accrued while it was closed are drained on launch where the source allows
   catch-up (schedules, polls, file scans).
4. The in-editor experience stays: pressing Run on a trigger workflow still
   listens live, so users can test interactively.

## Design

### The inversion

Separate *listening* from *executing*. A trigger node in the graph stops being
"the thing that listens" and becomes two things:

1. **A registration** — when the workflow is *activated*, each trigger node
   compiles to a `trigger_registrations` row (kind + config). The host owns
   listening.
2. **An entry point at run time** — when a run starts because of event E, the
   trigger node does not listen; it emits E's payload on its declared outputs
   and completes. The rest of the graph runs as normal.

This is the n8n/Temporal model: one run per event, stateless between events,
no standing actor. It is the only model that survives a cloud restart for
free, because all state (registrations, cursors, pending events) is in the
database.

```
world event ──► ingestion adapter (host-owned) ──► trigger_inputs (durable, idempotent)
                                                        │
                                                   dispatcher
                                                        │
                                        start run (or resume suspended run)
                                                        │
                                     trigger node emits payload → graph executes
```

### Components

**1. Trigger registry** (`packages/models`, new `trigger_registrations` table
plus Drizzle schema for the already-migrated `trigger_inputs`):

```
trigger_registrations
  id, user_id, workflow_id, node_id
  kind          -- 'webhook' | 'schedule' | 'file_watch' | 'poll:telegram' | ...
  config_json   -- node properties snapshot (path, interval, patterns, secret hash)
  enabled       -- the workflow-level "Active" toggle
  cursor        -- adapter progress marker (last update_id, last poll time, ...)
  last_fired_at, last_error
```

Rows are written when a workflow is saved+activated and deleted on
deactivation. `Workflow.hasTriggerNodes()` (already implemented) gates the
Activate toggle in the UI. Emit the existing `TriggerRegistered` run-event
type on activation so the event log finally reflects reality.

**2. Ingestion adapters** — host services, one per trigger kind, living in the
server process (cloud) or the Electron main process (desktop). Each adapter
watches its source and appends rows to `trigger_inputs` via
`TriggerWakeupService.deliverTriggerInput` (which already provides idempotency
by `inputId` and inbox append; it finally gets instantiated, backed by the new
Drizzle store instead of memory).

| Kind | Cloud adapter | Electron adapter |
|---|---|---|
| Webhook | one Fastify route `POST /api/webhooks/:token` on the main server; token maps to a registration, per-registration secret checked | not directly reachable; see relay below |
| Schedule/Interval | scheduler service: computes next-due from registrations, `last_fired_at` gives catch-up after restart (fire once if overdue, configurable) | same service in main process; drains missed ticks on launch per catch-up policy |
| File watch | n/a (no meaningful FS) | `fs.watch` in main process; on launch, optional scan-diff against a stored snapshot for changes while closed |
| Poll (Telegram, IMAP, RSS, Discord) | poll loop per registration, `cursor` column stores `update_id`/UID/etag — catch-up is inherent | same loop while app is open; cursor makes downtime lossless |

This kills `WebhookTriggerNode`'s embedded `http.createServer`: the node keeps
its type and outputs, but its config compiles to a registration and the server
route replaces the private port. On Fly that is the difference between
"impossible" and "works".

**3. Dispatcher** — consumes unprocessed `trigger_inputs`:

- Looks up the registration → workflow.
- Default mode **new-run-per-event**: starts a job through the existing
  `UnifiedWebSocketRunner.runJob` path with a `trigger_event` param
  (`{node_id, payload}`). Marks the input processed (`markProcessed`) only
  after the run is accepted, so a crash between store and dispatch re-delivers
  rather than drops. Emits `TriggerInputReceived`.
- Optional mode **resume** (phase 4, below): if a suspended run exists for
  this workflow and the trigger is marked resumable, deliver into that run's
  durable inbox and wake it instead of starting a fresh run.

Concurrency policy per registration: `parallel` (default), `queue`, or `skip`
— an interval trigger on a slow workflow must not pile up runs.

**4. Trigger nodes at run time.** `BaseNode` grows a small entry-point
contract:

```ts
static readonly isTrigger = true;
// called instead of genProcess() when the run carries a trigger_event for this node
async emitTriggerEvent(event: TriggerEvent, outputs: StreamingOutputs): Promise<void>
```

When the kernel starts a run with `trigger_event` targeting node N, N's actor
calls `emitTriggerEvent(payload)` — emit outputs, return, done. When the run
starts *without* a trigger event (user pressed Run in the editor), the node
falls back to today's `genProcess()` live-listening loop. That preserves the
interactive test experience with zero UX change, mirroring n8n's test-vs-
production webhook split.

**5. Electron specifics.** Adapters run in the main process for the lifetime
of the app; a tray/launch-at-login option extends coverage. Two sources need
more:

- **Webhooks can't reach a closed laptop.** Offer a cloud relay for logged-in
  users: the Fly server accepts the webhook, stores the `trigger_input`
  against the user, and the desktop app drains its queue on launch/via a
  lightweight sync socket while open. Without an account, webhook triggers are
  documented as online-only.
- **Missed file events.** `fs.watch` has no history. Store a `{path → mtime}`
  snapshot per registration on shutdown; on launch, diff and synthesize
  created/modified/deleted events before starting the live watcher.

**6. Cloud specifics.** All adapters and the dispatcher run in the single
server process, started from server boot (the point where
`TriggerWorkflowManager`'s old job would have been). Restart-safety comes from
the database, not a watchdog: on boot, re-arm schedules from
`trigger_registrations`, resume polls from `cursor`, and dispatch any
unprocessed `trigger_inputs`. The watchdog-restarts-a-standing-job model in
`trigger-manager.ts` becomes unnecessary for wake-up triggers; keep the class
only if an always-on streaming mode is ever exposed, otherwise delete it.

### Resume mode and suspension (phase 4)

New-run-per-event covers most automations. Conversational/stateful workflows
(a chat bot keeping context across messages) want one long-lived logical run
that sleeps between events. The primitives exist but the loop is open:

- Wire the missing resume path: an API/dispatcher entry that loads
  `suspension_state_json` from the `Job` row, rebuilds the runner for that
  graph, calls `setResumingState(state, seq)` on the suspended node, and
  continues execution. Emit `RunResumed`/`NodeResumed`.
- Give `ManualTrigger`-style nodes `TriggerState` semantics: wait for inbox
  events with an inactivity timeout; on timeout, `suspendForInactivity()`
  instead of spinning forever. The run costs nothing while idle and any new
  `trigger_input` wakes it through the dispatcher's resume branch.
- Back `DurableInbox` with the migrated `run_inbox_messages` table so events
  delivered to a suspended run survive a restart before it wakes.

This turns the currently-dead `TriggerState` + `TriggerWakeupService` +
suspension persistence into one coherent loop: run → idle → suspend → event →
resume.

## Phasing

1. **Durable foundation.** Drizzle schemas + stores for `trigger_inputs` and
   `run_inbox_messages`; `trigger_registrations` table; instantiate
   `TriggerWakeupService` on the DB store; workflow Activate toggle writing
   registrations. No behavior change for existing runs.
2. **Cloud wake-up.** Webhook ingestion route, scheduler adapter, dispatcher
   with new-run-per-event, `emitTriggerEvent` entry point in the kernel,
   replace the trigger REST stubs (`/api/jobs/triggers/*`) with real
   list/start/stop over registrations. This delivers "cloud reacts to world
   events".
3. **Electron wake-up.** Run the same adapters in the main process; file-watch
   snapshot diff; launch-time drain; optional cloud webhook relay.
4. **Resume mode.** Wire `setResumingState` end-to-end; inactivity suspension
   for manual/chat triggers; dispatcher resume branch.
5. **Real source adapters.** Telegram `getUpdates` long-poll and Discord
   gateway (or polling) as host adapters, replacing the token-validation-only
   `process()` stubs in `integration-nodes/src/nodes/messaging.ts`.

## Decisions to confirm

- **New-run-per-event as the default** (resume as opt-in per trigger node)
  rather than resume-first. Recommended: fresh runs are restart-safe and
  parallelizable; resume is the special case.
- **Deprecate `WebhookTriggerNode`'s own HTTP server** once the ingestion
  route ships, keeping it only for the in-editor live-test path.
- **Catch-up policy defaults**: overdue schedule fires once (not N times);
  poll cursors catch up fully; file-watch snapshot diff is opt-in per
  registration.
- **Delete vs. keep `TriggerWorkflowManager`** after phase 2 — it manages a
  standing-job model this design removes.
