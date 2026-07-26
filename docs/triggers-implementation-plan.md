# Implementation Plan: Workflow Triggers

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-07-26
**PRD:** [triggers-prd.md](triggers-prd.md)
**Design doc:** [triggers-design.md](triggers-design.md)

This plan turns the design into ordered, reviewable PRs with file-level targets and exit criteria. Estimates assume one engineer full-time. Workstreams marked ∥ can run in parallel with a second engineer.

---

## 0. Ground rules

- Every PR passes `npm run check` (typecheck, lint, test) and follows repo conventions: strict TS, no `any`, `ui_primitives` only, design tokens, Zustand selectors, tests in `__tests__/`.
- Schema changes are additive, mirrored in `packages/models/src/schema/` **and** `packages/models/src/schema-pg/`, registered in `packages/models/src/migrations/versions.ts`, and asserted in `migrations.test.ts` via `tableExists`.
- New backend code lands in `packages/triggers` (a new workspace package) plus surgical changes to `packages/websocket`, `packages/models`, and `web/`. No changes to `packages/kernel` or `packages/runtime` except the deletions in PR 9.
- Feature flag through the existing settings registry (`packages/websocket/src/settings-registry.ts` → `registerSetting`): `triggers_enabled`, default **off** until PR 8.
- The dispatcher runs in the `websocket` process. It starts only when the flag is on.
- No PR leaves the tree with a trigger that can fire without the safety rules from PR 3. PRs 1–3 land together or not at all.

---

## Phase A — the mechanism

### PR 1 — Schema and model ∥

**Files**

- `packages/models/src/schema/trigger-registrations.ts` — drop `node_id` and its unique index, widen `cursor` to `state`, add the columns from design §4
- `packages/models/src/schema/trigger-events.ts` — new
- `packages/models/src/schema-pg/trigger-registrations.ts`, `schema-pg/trigger-events.ts` — mirrors
- `packages/models/src/trigger-registration.ts` — rewrite the model; add `findDue`, `claim`, `settle`, `disable`
- `packages/models/src/trigger-event.ts` — new
- `packages/models/src/migrations/versions.ts` — one migration reshaping `trigger_registrations`, one creating `trigger_events`, one dropping `trigger_inputs`
- `packages/models/tests/trigger-registration.test.ts`, `migrations.test.ts`

**Exit criteria**

- `claim()` is atomic: a test firing 20 concurrent claims against 5 due rows dispatches each row exactly once.
- `serialize_key` excludes a second row while the first is `claimed`.
- The reaper returns rows claimed past the threshold to `pending`.
- Migration up and down both pass on SQLite and Postgres.

**Estimate:** 3 days

### PR 2 — Scheduler package

**Files**

- `packages/triggers/` — new workspace (`package.json`, `tsconfig.json`, `src/index.ts`)
- `src/schedule.ts` — `nextScheduled(reg)`: cron with IANA timezone, interval with slot skipping, self-scheduled override with a 1s floor
- `src/dispatcher.ts` — the tick, `claim → dispatch → settle`
- `src/settle.ts` — the state, retry, and disable rules from design §5
- `packages/triggers/tests/` — schedule table tests including DST transitions in both directions, settle-semantics tests

**Dependencies:** a cron parser. Prefer `cron-parser` (no native deps, timezone support). Add to `packages/triggers/package.json` explicitly, per the automation-nodes lesson about hoisting.

**Exit criteria**

- DST: a `0 8 * * *` / `Europe/Berlin` registration fires once at local 8am across both transitions, verified with a fixed clock.
- Interval after 3 hours of downtime fires **once**, not 12 times.
- A run returning `next_fire_at` overrides the schedule; returning `now` clamps to 1s and logs.
- State writes back on a failed run that emitted one; does not write when the output is absent.
- 5 consecutive failures disables. `expires_at`, `max_runs`, and `max_usd` each disable with a distinct reason.

**Estimate:** 4 days

### PR 3 — Wire the dispatcher to the job queue

**Files**

- `packages/websocket/src/triggers/service.ts` — start and stop the tick with the server lifecycle, behind `triggers_enabled`
- `packages/websocket/src/unified-websocket-runner.ts` — accept `secretScope` and `registrationId` on enqueue; thread them onto the run
- `packages/runtime/src/secrets.ts` (resolver) — try `<scope>/<key>` then `<key>`
- `packages/websocket/src/settings-registry.ts` — `registerSetting({ key: "triggers_enabled", ... })`
- cost ledger write path — stamp `registration_id`

**Exit criteria**

- An interval registration runs a real workflow end to end and its state round-trips.
- `secret_scope` resolution falls back correctly and is covered by a test with both a scoped and an unscoped key.
- Dispatch respects `MAX_CONCURRENT_JOBS`; a burst of 50 events drains without exceeding it.
- Flag off means no timer is created.

**Estimate:** 3 days

---

## Phase B — the surfaces

### PR 4 — HTTP event route

**Files**

- `packages/websocket/src/routes/triggers.ts` — `POST /api/triggers/:token`
- `packages/websocket/src/server.ts` — register the route, add the path to the unauthenticated allowlist alongside `/api/kie/webhook`
- raw-body capture before JSON parsing, for HMAC
- `packages/websocket/tests/routes/triggers.test.ts`

**Exit criteria**

- HMAC-SHA256 verification against a real GitHub sample payload, compared in constant time; a tampered body is rejected 401.
- Body over 1MB is rejected 413.
- Duplicate `dedupe_key` returns 200 with the original run id and starts no second run.
- Response is `202 {run_id}` in under 50ms, with dispatch happening eagerly rather than on the next tick.

**Estimate:** 3 days

### PR 5 — tRPC CRUD and the `Triggers` node ∥

**Files**

- `packages/websocket/src/trpc/routers/triggers.ts` — list, create, update, delete, fire now, by tag
- `packages/automation-nodes/src/nodes/trigger-admin.ts` — a node that creates, updates, and deletes registrations (use case 17)
- `packages/cli/src/commands/triggers.ts` — `nodetool triggers list|create|fire|disable`
- tests for each

**Exit criteria**

- A workflow can register a trigger for another workflow, and the created registration fires.
- `nodetool triggers list --tag client-7` filters.
- Deleting a workflow cascades to its registrations.

**Estimate:** 3 days

### PR 6 — Triggers tab ∥

**Files**

- `web/src/components/workflows/TriggersPanel.tsx` and children
- `web/src/hooks/useTriggers.ts` — TanStack Query, hierarchical keys
- `web/src/components/workflows/TriggerCreateDialog.tsx` — schedule or webhook, the first-run backfill question, the secret display
- Registered in the workflow's tab set

**Exit criteria**

- `ui_primitives` only, design tokens only, no raw MUI, verified by lint.
- Enabling a polling trigger asks the backfill question and seeds `state`.
- Last error, next fire, and disabled-with-reason are all visible without opening anything.
- Webhook URL and secret are copyable; the secret is shown once.
- RTL tests use `getByRole` and `userEvent`.

**Estimate:** 4 days

### PR 7 — Desktop file adapter ∥

**Files**

- `electron/src/triggers/fileWatcher.ts` — read desktop registrations, watch, debounce, wait for write settle, POST
- `electron/src/main.ts` — start and stop with the app
- `web/` — mark `scope: 'desktop'` registrations as unavailable in the browser with the reason

**Exit criteria**

- A file written in three chunks produces one event.
- A watch path that disappears disables the registration with a clear error rather than throwing in a loop.
- Restarting the app resumes every enabled desktop registration.

**Estimate:** 3 days

---

## Phase C — safety, rollout, deletion

### PR 8 — Guardrails and enable

**Files**

- `packages/websocket/src/triggers/budget.ts` — per-period spend check against the cost ledger keyed on `registration_id`, reusing the `application_budgets` reserve-then-reconcile shape
- workflow save path — validate the `state` input/output contract when a registration exists; warn on break (O6)
- agent tool policy — destructive tools off by default in triggered runs; editor warning when a triggered workflow gives an agent write or shell tools (O8)
- templates — wrap trigger payloads in a delimited untrusted-content block
- `triggers_enabled` default flips to on

**Exit criteria**

- A registration over `max_usd` disables with a budget reason and does not start the run.
- Renaming the `state` output on a workflow with a live registration produces a save-time warning.
- A triggered agent run cannot call a destructive tool unless the registration opts in.

**Estimate:** 4 days

### PR 9 — Delete the dead layer

**Files removed**

- `packages/kernel/src/trigger.ts`, `trigger-manager.ts`, `trigger-wakeup.ts` and their exports from `src/index.ts`
- `packages/kernel/tests/trigger.test.ts`, `trigger-manager.test.ts`, `trigger-wakeup.test.ts`
- `ManualTrigger`, `IntervalTrigger`, `WebhookTrigger`, `FileWatchTrigger` from `packages/automation-nodes/src/nodes/triggers.ts`
- `Workflow.hasTriggerNodes()` and its tests
- `trigger_inputs`, `run_inbox_messages`, `run_leases`, `workers` schemas, models, and migrations

**Files changed**

- `WaitNode` — re-arm in chunks below 2³¹−1 ms, mirroring the fix at `packages/kernel/src/trigger.ts:98`, and document the ceiling
- `packages/dsl/src/generated/nodetool.triggers.ts` — regenerate
- `packages/automation-nodes/README.md`, `AGENTS.md` — drop the trigger section, point at the new docs
- `CLAUDE.md` — add the triggers CLI and the `packages/triggers` package to the architecture list

**Migration for existing users:** any workflow containing a removed node type fails validation with a message pointing at the Triggers tab. Nothing auto-migrates, because none of these nodes work today and no user can have a functioning trigger workflow.

**Deprecation:** the kernel symbols are exported from `@nodetool-ai/kernel`. Mark them `@deprecated` in the release before this PR, delete in the release after.

**Exit criteria**

- `npm run check` green.
- `rg "hasTriggerNodes|TriggerWorkflowManager|TriggerWakeupService"` returns nothing outside changelogs.
- Net line count of the whole feature is negative.

**Estimate:** 2 days

### PR 10 — Docs and templates ∥

**Files**

- `docs/triggers.md` — user guide: scheduling, webhooks, state, self-scheduling, safety
- `docs/cookbook/` — three worked examples: the 18-client weekly report, the RSS repurposer with per-item cursor advance, the client-approval two-workflow split
- Template workflows shipped with `app_doc`, generated by the existing `scripts/generate-template-apps.mjs`

**Exit criteria**

- Every template that posts to a third party documents its action-level dedupe key.
- The RSS example demonstrates partial-progress state, since that is the semantic most likely to be misread.

**Estimate:** 3 days

---

## Sequencing

```
PR1 ─┬─ PR2 ── PR3 ─┬─ PR4 ─┬─ PR8 ── PR9
     │              ├─ PR5 ─┤
     │              ├─ PR6 ─┤
     └──────────────┴─ PR7 ─┴─ PR10
```

PRs 1–3 are the critical path and land as one reviewable stack. Phase B parallelizes across two engineers. PR 8 gates the flag; PR 9 cannot land before it.

**Total:** ~32 engineer-days, or about 3 weeks with two engineers on Phase B.

---

## Rollout checklist

- [ ] `triggers_enabled` off in production while PRs 1–7 land.
- [ ] Dogfood: the repo's own weekly examples-freshness check runs as a cron registration for two weeks.
- [ ] Deploy-survival test: enable a 1-minute interval trigger, deploy, confirm exactly one fire per minute across the restart with no duplicate `dedupe_key`.
- [ ] Burst test: 200 webhook posts in 10 seconds, confirm the queue drains and no run is lost or duplicated.
- [ ] Poison test: a registration whose workflow always throws disables itself after 5 failures with the error visible in the UI.
- [ ] Budget test: a registration with `max_usd = 1` stops after the run that crosses it.
- [ ] Flip `triggers_enabled` on by default.
- [ ] Deprecate the kernel trigger exports.
- [ ] Next release: PR 9.

---

## Risks to the plan

| Risk | Handling |
|---|---|
| Cron plus timezone plus DST is where scheduler bugs live | PR 2 exits on a fixed-clock table test covering both transitions; no hand-rolled cron |
| The eager-dispatch path bypasses a rule the tick applies | Both callers go through the same `claim → dispatch → settle`; a test asserts parity |
| Reaper reclaims a live 25-minute render | Open question 1 in the design; resolve before PR 3 |
| Deleting kernel exports breaks an external consumer | One-release deprecation, PR 9 is last |
| Phase 2 pressure arrives early ("but I need approval mid-run") | Use case 6's two-workflow split is the documented answer; revisit only when a case it cannot serve appears |
