# PRD: Workflow Triggers

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-07-26
**Design doc:** [triggers-design.md](triggers-design.md)
**Implementation plan:** [triggers-implementation-plan.md](triggers-implementation-plan.md)

---

## 1. Summary

A NodeTool workflow runs when a human presses Run. Triggers make it run on its own: at 8am every weekday, when a webhook fires, when a file lands in a folder, when a client approves a draft.

Five trigger nodes ship in the palette today (`nodetool.triggers.*`). None of them work as an automation, and one of them cannot work at all. Behind them sits a kernel trigger runtime and six database tables that were ported from the Python codebase and never connected to anything.

This PRD proposes replacing all of it with one idea: **a trigger is a row in a table, not a node in a graph.** The graph goes back to being a pure function of its inputs. A scheduler outside the graph decides when to call it and with what.

The scope is one table, one dispatch loop, one HTTP route, and a Triggers tab on the workflow. Estimated cost is roughly 3 engineer-weeks to a shippable Phase 1, with a net deletion of about 1900 lines.

---

## 2. Problem

### 2.1 What ships today does not work

| Node | State |
|---|---|
| `ManualTrigger` | Cannot receive events. Its inbox has no registered upstream, so `run()` sees end-of-stream on the first read and exits emitting nothing. `pushInputValue()` writes to a node's *downstream* inboxes, not its own, so the mechanism named in its own doc comment cannot reach it. |
| `WebhookTrigger` | Binds `http.createServer` inside the workflow process. Two concurrent runs collide on the port, and on Fly only the app port is routed, so it is unreachable from outside. No body size cap, no signature verification, always answers `200` with no way to return a result. |
| `IntervalTrigger` | Works, but loops forever with no cancellation. `interval_seconds` has no minimum, so `0` produces a 1ms hot loop. |
| `FileWatchTrigger` | Works locally. Leaks one map entry per touched path for the life of the watcher. Cannot run on Fly, which has no filesystem to watch. |
| `Wait` | Any wait over ~24.8 days returns instantly. `setTimeout` clamps delays above 2³¹−1 ms, a pitfall the kernel documents at `packages/kernel/src/trigger.ts:98` and works around, and that `WaitNode.process()` then reintroduces. |

None of the three generator nodes observe `runner.cancel()`. Cancelling a webhook run leaves the port bound and the generator parked until the process exits.

There is no product surface. Nothing in `web/src` references trigger nodes. A user who drops one on the canvas gets a run that never finishes.

### 2.2 What was built and never connected

- `packages/kernel/src/trigger.ts`, `trigger-manager.ts`, `trigger-wakeup.ts` (784 lines, 1143 lines of tests, 63 test cases). Zero non-test callers.
- `Workflow.hasTriggerNodes()` (`packages/models/src/workflow.ts:86`). Zero callers.
- Six tables with models and migrations, no callers: `trigger_registrations`, `trigger_inputs`, `run_inbox_messages`, `run_leases`, `run_node_state`, `workers`.
- `resumeJob()` (`packages/websocket/src/unified-websocket-runner.ts:2978`) delegates to `reconnectJob()`. Resume-from-suspension does not exist.

The code is careful and well tested. It guards races that cannot happen, because nothing calls it. The tests report green on a feature that is not there.

### 2.3 Why this matters now

Every workflow in NodeTool is a thing a person opens. Triggers are what turn it into a thing that runs while they sleep. For the target user that difference is most of the product's value: the report writes itself on Monday morning, the brief becomes a proposal before anyone reads the email, the render starts overnight.

---

## 3. Users

**Solo freelancers** (designers, editors, copywriters, developers, social managers). One person, 3–15 clients, no ops budget. They need automation that survives a laptop reboot and does not require a server.

**Small agencies** (2–30 people). The same workflow run for 18 clients, each with its own credentials, brand config, and invoice line. They need per-client isolation, bulk lifecycle, and cost attribution.

Both share one hard constraint: a broken automation that silently spends money is worse than no automation. Operational safety is a feature requirement, not a polish item.

---

## 4. Use cases

Twenty-one scenarios were run against the design. These are the ones that shaped it.

### 4.1 Scheduled work

| # | Scenario | What it requires |
|---|---|---|
| 1 | Every weekday 8am, summarize unread email, post to Slack | cron with timezone, not a fixed interval |
| 4 | Poll an RSS feed every 15 min, process only new items | a cursor; partial-failure progress |
| 12 | Weekly report for 18 clients from one workflow | per-registration config, credentials, cost attribution |
| 15 | Daily campaign posts until Nov 30 | an end date |
| 16 | Monday 60-second brand video, 25 min, ~$8 per run | no overlap, spend ceiling, low retry count |
| 18 | Watch 40 competitor pricing pages, alert on real changes | small state on the row, corpora elsewhere |
| 20 | Alert when a retainer client exceeds their monthly hours | state as a latch, not a cursor, so the alert fires once |

### 4.2 Event-driven work

| # | Scenario | What it requires |
|---|---|---|
| 2 | GitHub PR comment starts a workflow | HMAC signature verification, burst tolerance |
| 3 | New PDF in `~/Downloads` gets OCR'd and filed | a desktop adapter; the trigger cannot run in the cloud |
| 5 | Chat message gets a workflow reply | sub-second dispatch latency |
| 19 | New YouTube upload becomes 5 shorts and 3 posts | action-level dedupe so a retry does not double-post |
| 21 | Client emails a brief, workflow drafts a proposal | IMAP polling; the payload is untrusted input to an agent |

### 4.3 Work that waits

| # | Scenario | What it requires |
|---|---|---|
| 6 | Draft an email, wait for approval, then send | splits into two workflows plus a stored draft; no parked run needed |
| 13 | Client picks one of 4 ad variants via a link | a share-token trigger, a reminder, an expiry |
| 14 | Poll a render farm until the 4K export finishes | the run decides when it next fires |

### 4.4 Operations

| # | Scenario | What it requires |
|---|---|---|
| 7 | Re-run last night's failed job | manual fire, visible last error |
| 8 | A broken workflow fires every minute for a day | consecutive-failure auto-disable, backoff |
| 9 | Someone renamed an output while the trigger was live | validate the state contract on save |
| 10 | First tick of a new RSS trigger | ask whether to backfill, seed initial state |
| 11 | Per-sender ordering; a poll that must not overlap itself | one serialization key covers both |
| 17 | New client signs, provision everything including their triggers | a run can create registrations |

---

## 5. Goals

- **G1.** A workflow can be started by a schedule or an external event, with no trigger node in the graph.
- **G2.** A triggered workflow is an ordinary workflow. It runs from the editor, from the CLI, and from a trigger with the same inputs and the same result.
- **G3.** Schedules survive process restart, deploy, and crash without a watchdog.
- **G4.** A trigger cannot silently burn money: bounded retries, a spend ceiling, and auto-disable on repeated failure.
- **G5.** One workflow serves many clients, each with its own config, credentials, state, and cost line.
- **G6.** Net deletion. The feature ships smaller than the dead code it replaces.

## 6. Non-goals

- **N1. Resuming a run that died mid-flight.** A failed run retries from the top. This is correct and cheap for polling and webhooks. It is wrong for expensive multi-step runs with non-idempotent side effects in the middle, and that is the case that would justify the durable-execution substrate already sitting in the schema. Not now.
- **N2. Synchronous webhooks.** The endpoint answers `202` with a run id. Returning workflow output in the HTTP response is a separate feature.
- **N3. A distributed scheduler.** One process claims and dispatches. The claim is safe across machines, but there is no work-stealing, no partitioning, and no leader election.
- **N4. Sub-second scheduled precision.** Dispatch is on a 1s tick. Event triggers dispatch eagerly and do not pay it.

---

## 7. Requirements

### 7.1 Functional

- **F1.** A registration binds a workflow to a schedule or an event source, with a JSON config, and can be enabled or disabled.
- **F2.** Schedules are expressed as a fixed interval or a cron expression with an IANA timezone.
- **F3.** A run may return a `next_fire_at` that overrides its schedule for the following fire.
- **F4.** A registration carries a JSON `state` blob. It is passed to the run as a param and written back from the run's `state` output whenever the run produces one, regardless of run status.
- **F5.** Every run receives `last_fired_at`, `now`, and `is_first_run` as params. `last_fired_at` is the last *successful* fire, so a failed occurrence's window is re-covered; `is_first_run` stays true until the first success.
- **F6.** `POST /api/triggers/:token` inserts an event and returns `202` with the event id, plus the run id when the run was dispatched inline. A duplicate delivery returns `200` with the original ids; a disabled or expired registration returns `410`. Auth is per registration: shared token, HMAC-SHA256 over the raw body, or none.
- **F7.** Rows sharing a `serialize_key` run one at a time. Poll registrations default to their own id.
- **F8.** A registration may set `expires_at` and `max_runs`.
- **F9.** Secrets resolve `<secret_scope>/<key>` before falling back to `<key>`.
- **F10.** Registrations carry tags for bulk enable, disable, and filtering.
- **F11.** A workflow can create, update, and delete registrations through a node and the REST API.
- **F12.** Desktop-scoped registrations (filesystem) are driven by an adapter in the Electron main process and are marked as unavailable in the browser.

### 7.2 Operational

- **O1.** After N consecutive failures (default 5) a registration disables itself and retains the last error.
- **O2.** Retries back off exponentially, capped by `max_attempts` (default 3).
- **O3.** A registration may set `max_usd` per period. The check runs before dispatch as well as after settle, and exceeding it disables the registration rather than skipping a run silently.
- **O4.** Cost records carry `registration_id` so spend groups by trigger and by tag.
- **O5.** Dispatch goes through the existing job queue and inherits `MAX_CONCURRENT_JOBS` and `MAX_CONCURRENT_RUNS_PER_WORKFLOW`.
- **O6.** Saving a workflow that a registration depends on validates the `state` input/output contract and warns when it breaks.
- **O7.** Deleting a workflow deletes its registrations.
- **O8.** Trigger payloads are marked untrusted. Templates that feed one into an agent wrap it in a delimited untrusted-content block, and the editor warns when a triggered workflow gives an agent destructive tools.

---

## 8. UX

**Triggers tab on the workflow.** A list of registrations: kind, schedule or endpoint, last fired, last error, next fire, enabled toggle, and a Run now button. Adding one asks for the schedule or copies the webhook URL and secret.

**First-run question.** Enabling a polling trigger asks whether to process existing items or only new ones. The answer seeds the initial state.

**Failure surfacing.** A disabled-on-failure registration shows in the tab and in the workflow list. The error text is the run's error, not a generic string.

**Cost.** `nodetool costs` gains `--by-trigger` and `--tag`.

---

## 9. Success metrics

- A workflow can be scheduled and running within 60 seconds of opening the Triggers tab, with no code.
- Zero registrations in the wild that have failed more than 5 times consecutively and are still enabled.
- Scheduled fires survive a deploy with no missed or duplicated runs, verified by a dedupe-key assertion in the rollout check.
- Net line count of the change is negative.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| At-least-once delivery double-posts to a client's social account | Action-level dedupe keyed on the source item id, documented in every template that posts |
| A cron trigger with an agent is a standing prompt-injection target | O8: untrusted-content framing, destructive tools off by default in triggered runs, editor warning |
| Users put business data in `state` and it becomes an unqueryable second database | 64KB cap with a clear error, and docs pointing at collections and SQLite nodes |
| Backfill on first enable generates hundreds of paid runs | The first-run question, plus `max_usd` |
| Deleting the dead kernel layer removes something a downstream consumer imports | The symbols are exported from `@nodetool-ai/kernel`; deprecate in one release, delete in the next |

---

## 11. Phasing

**Phase 1 (this PRD).** Registrations, the dispatch loop, cron and interval schedules, the webhook route, self-scheduling, state, serialization, the safety rules, the Triggers tab, and the desktop file adapter. Deletion of the dead layer.

**Phase 2 — dropped (2026-08-26).** Parked runs (a node that suspends a run until an event addresses it) needed a resume path that was never built: only the suspending node's state was ever persisted, so a resume would have re-run every upstream node. The suspend half, `run_leases`, and `run_node_state` are deleted. Use case 6's two-workflow split is the answer for approval flows. Reviving this means designing output persistence and a replay contract first, not restoring the tables.
