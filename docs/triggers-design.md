# Workflow Triggers — Technical Design

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-07-26
**PRD:** [triggers-prd.md](triggers-prd.md)
**Implementation plan:** [triggers-implementation-plan.md](triggers-implementation-plan.md)

---

## 1. Summary

A trigger is a row in `trigger_registrations`. One loop claims due rows and dispatches them into the existing job queue. Nothing about triggering lives in the graph.

The design rests on one reframe. "Wake up" is doing double duty for two problems:

1. **Start a run** because something happened (a clock tick, an HTTP POST, a file change).
2. **Resume a run** parked mid-flight (a human approval, an external callback).

The shipped code answers both by keeping a process alive inside the graph, then adds suspension, a durable inbox, and a watchdog to survive the fact that processes die. Problem 1 does not need any of that. It needs a start. Once starting moves out of the graph, problem 2 shrinks enough to defer entirely (PRD §11).

---

## 2. Design goals

- **D1.** State lives in the database, not in a process. Restart safety is then a property of the storage engine, not of a watchdog.
- **D2.** One dispatch path. The clock, the HTTP route, the UI, and the desktop adapter all insert rows; none of them call the runner.
- **D3.** The graph stays a pure function of its inputs. No node knows it was triggered.
- **D4.** Scheduling logic that is really business logic belongs in the workflow, not the scheduler.
- **D5.** Reuse: the job queue, the secret store, the cost ledger, the budget model, and share tokens all exist. Add no parallel versions.

---

## 3. Architecture

```
  clock tick ─┐
  HTTP POST ──┤
  desktop  ───┼──▶ trigger_registrations ──▶ claim ──▶ job queue ──▶ WorkflowRunner
  UI / API ───┤         (one row per trigger)    │                        │
  a run ──────┘                                  │                        │
                                                 └──── settle ◀───────────┘
                                          (state, next_fire_at, attempts, cost)
```

One loop drives the middle. Everything on the left inserts or updates a row. Everything on the right is unchanged NodeTool.

---

## 4. Data model

`trigger_registrations` exists (`packages/models/src/schema/trigger-registrations.ts`) with `id`, `user_id`, `workflow_id`, `node_id`, `kind`, `config_json`, `enabled`, `cursor`, `last_fired_at`, `last_error`. It is unused, so it can be reshaped freely.

Two changes to what is there:

- **Drop `node_id`** and the `unique(workflow_id, node_id)` index. There are no trigger nodes, and a workflow needs more than one trigger.
- **Widen `cursor TEXT` to `state JSON`.** Use case 20 needs a latch (`{alerted_at, month}`), not a cursor string.

Additions:

```sql
-- scheduling
next_fire_at     TEXT,            -- the loop's only index; NULL = event-driven only
every_s          INTEGER,         -- fixed interval
cron_expr        TEXT,            -- 5-field cron, mutually exclusive with every_s
cron_tz          TEXT,            -- IANA zone, e.g. "Europe/Berlin"

-- lifecycle
status           TEXT NOT NULL DEFAULT 'pending',  -- pending | claimed — dispatch state only.
                                                   -- "Disabled" is not a status: it is enabled=0
                                                   -- plus disabled_reason, so a registration can be
                                                   -- re-enabled without losing its dispatch state.
disabled_reason  TEXT,            -- failures | expired | max_runs | budget | user
attempts         INTEGER NOT NULL DEFAULT 0,
consecutive_failures INTEGER NOT NULL DEFAULT 0,
expires_at       TEXT,
max_runs         INTEGER,        -- counts successful runs (see §5)
run_count        INTEGER NOT NULL DEFAULT 0,

-- concurrency
serialize_key    TEXT,            -- rows sharing a key run one at a time

-- safety
max_attempts     INTEGER NOT NULL DEFAULT 3,
max_usd          REAL,
budget_period    TEXT DEFAULT 'month',

-- multi-tenancy and ops
secret_scope     TEXT,
tags             JSON,
scope            TEXT NOT NULL DEFAULT 'cloud',   -- cloud | desktop

-- event auth
auth_mode        TEXT NOT NULL DEFAULT 'token',   -- token | hmac_sha256 | none
auth_secret      TEXT,            -- reference into the secret store, not the
                                  -- secret itself; the row stays safe to list
auth_header      TEXT             -- signature header name for hmac_sha256
```

Indexes: `(status, next_fire_at)` for the claim, `(workflow_id)`, `(kind, enabled)`, `(serialize_key, status)`.

A second table holds inbound events, so a burst of webhooks does not contend on the registration row:

```sql
CREATE TABLE trigger_events (
  id           TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL,
  payload_json JSON,
  dedupe_key   TEXT,
  serialize_key TEXT,            -- copied from the registration at insert; a config
                                 -- payload path can override it per event, which is
                                 -- how per-conversation ordering (use case 5) works
  status       TEXT NOT NULL DEFAULT 'pending',
  attempts     INTEGER NOT NULL DEFAULT 0,
  next_fire_at TEXT NOT NULL,
  run_id       TEXT,
  created_at   TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_trigger_events_dedupe ON trigger_events(registration_id, dedupe_key);
CREATE INDEX idx_trigger_events_due ON trigger_events(status, next_fire_at);
```

Events carry their own `serialize_key` (denormalized at insert) so the claim can
enforce ordering across both tables with one predicate: a key is busy if any row
in either table holds it in `claimed`.

The existing `trigger_inputs` table is close to this but is keyed by `(run_id, node_id)`, which is the parked-run addressing scheme from the abandoned design. Drop it with the rest.

---

## 5. The dispatch loop

```ts
// one setInterval(1000) in packages/websocket
async function tick() {
  const due = await claim();               // atomic; see below
  for (const item of due) void dispatch(item);
}

async function claim() {
  // UPDATE ... WHERE status='pending' AND next_fire_at <= now
  //   AND (serialize_key IS NULL OR serialize_key NOT IN (
  //         SELECT serialize_key FROM ... WHERE status='claimed'))
  // SET status='claimed' LIMIT n RETURNING *
}

async function dispatch(item) {
  const reg = item.registration;
  if (overBudget(reg)) return disable(reg, 'budget');   // check BEFORE spending, not only at settle
  if (reg.expires_at && nowIso() > reg.expires_at) return disable(reg, 'expired');
  const params = {
    ...reg.config_json,
    ...item.payload,                       // event triggers only
    state: reg.state,
    last_fired_at: reg.last_fired_at,
    now: nowIso(),
    is_first_run: reg.run_count === 0,
  };
  const job = await jobQueue.enqueue(reg.workflow_id, params, {
    userId: reg.user_id,
    secretScope: reg.secret_scope,
    registrationId: reg.id,
  });
  await settle(item, await job.completion);
}
```

`settle` is where the semantics live. For a scheduled item the retry and
next-fire bookkeeping lands on the registration row; for an event item it lands
on the event row (the registration only accumulates `consecutive_failures`,
`last_error`, `run_count`, and state). Both end by returning the claimed row to
`pending` — a settle that forgets to release the claim is a stuck trigger:

```ts
async function settle(item, result) {
  // 1. State: write back whenever the run produced one, success or not.
  if (result.outputs.state !== undefined) reg.state = result.outputs.state;

  // 2. Next fire: the run wins, then the schedule.
  const next = result.outputs.next_fire_at ?? nextScheduled(reg);

  if (result.ok) {
    reg.consecutive_failures = 0;
    reg.run_count++;                       // counts successes; max_runs and is_first_run key off it
    reg.last_fired_at = item.claimed_at;   // so last_fired_at = last SUCCESSFUL fire; a failed
                                           // occurrence re-covers its window on the next run,
                                           // which is the at-least-once contract
    reg.next_fire_at = next;
  } else {
    reg.consecutive_failures++;
    reg.last_error = result.error;
    reg.attempts++;
    reg.next_fire_at = reg.attempts < reg.max_attempts
      ? nowPlus(backoff(reg.attempts))     // 2^attempts seconds, capped at 300s
      : next;                              // give up on this occurrence
    if (reg.attempts >= reg.max_attempts) reg.attempts = 0;
  }
  reg.status = 'pending';                  // release the claim on BOTH paths

  if (reg.consecutive_failures >= 5) disable(reg, 'failures');
  if (reg.expires_at && next > reg.expires_at) disable(reg, 'expired');
  if (reg.max_runs && reg.run_count >= reg.max_runs) disable(reg, 'max_runs');
  if (overBudget(reg)) disable(reg, 'budget');
}
```

`is_first_run` is `run_count === 0`, so it stays true until the first *success*.
A first run that fails and retries sees `is_first_run` again, which is what a
backfill-seeding run wants.

### 5.1 Why a 1s poll and not long timers

`setTimeout` clamps any delay above 2³¹−1 ms (~24.85 days) to 1 ms. The kernel documents this at `trigger.ts:98` and re-arms in chunks to work around it; `WaitNode` reintroduces it. A `next_fire_at <= now` comparison against a 1s tick cannot have the bug, at the cost of up to one second of scheduled latency. Event triggers do not pay that cost (§5.3).

### 5.2 Claiming is the only lock

`UPDATE ... WHERE status='pending'` is atomic in SQLite and in Postgres (`schema-pg` mirrors every table). Whoever's update lands first owns the row. This is why `run_leases` is unnecessary: the claim *is* the lease, and it lasts exactly as long as the dispatch.

One portability note: `UPDATE ... LIMIT ... RETURNING` needs an optional SQLite build flag. The portable claim is `SELECT` the candidate ids, then `UPDATE ... WHERE id IN (...) AND status='pending' RETURNING *`, keeping only the rows the update actually flipped. Same atomicity, standard builds.

A crashed process leaves rows in `claimed`. A reaper in the same tick returns rows claimed longer than a threshold to `pending`, which is at-least-once and consistent with the retry semantics.

### 5.3 Eager dispatch

A chat reply cannot wait a second. Inserting a due event calls the same `claim`-then-`dispatch` path inline. The poller becomes the safety net for anything an insert-time crash missed. Two callers, one code path, so there is still one place where a run starts.

---

## 6. State

The `state` blob is passed in as a run param and read back from an output of the same name. No new node types: a workflow with an Input named `state` and an Output named `state` is a stateful trigger, and one without is stateless. It stays runnable by hand:

```bash
npm run dev:nodetool -- workflows run <id> --params '{"state":{"since":"2026-07-01"}}'
```

### 6.1 Write back on failure too

Run status controls *retry scheduling*. The state output controls *position*. Conflating them is a bug: an RSS run that posts items 1–6 and fails on 7 must not reprocess 1–6, and it will if state only persists on success.

The workflow is responsible for advancing state incrementally if it wants partial-progress semantics. A workflow that emits `state` only at the end gets all-or-nothing, which is a reasonable default.

### 6.2 What does not belong in it

State is what the trigger needs to decide what to fetch next. Forty content hashes qualify at about 3KB. A corpus of every URL ever seen does not, and belongs in a vectorstore collection or a SQLite node.

Enforced with a 64KB cap that fails the settle with a clear error, and `{v: 1, ...}` versioning so the shape can migrate.

### 6.3 Most pollers need no explicit state

`last_fired_at` and `now` are passed to every run. "Everything since the last run" is the common case and needs nothing on the row.

---

## 7. Scheduling

Three sources, in precedence order:

1. **The run.** A `next_fire_at` output overrides everything for the next fire.
2. **`cron_expr` + `cron_tz`.** Calendar semantics, DST-correct. `every_s` cannot express "8am local" (use case 1).
3. **`every_s`.** `next = anchor + ceil((now − anchor) / every_s) * every_s`, which skips missed slots after downtime rather than firing a burst.

Self-scheduling (D4) is the load-bearing one. It collapses several features that would otherwise each need their own mechanism:

| Want | Return |
|---|---|
| Poll a render job with backoff | `now + min(2^n, 300s)` |
| Remind a client on Thursday | `now + 2 days` |
| Check the day before each renewal | the computed date |
| Nothing happened, back off | `now + 1h` |
| This client is hot, check often | `now + 30s` |

Cron and interval become defaults for the first fire. After that the workflow schedules itself, in the graph, where the user can see and edit the logic.

---

## 8. Concurrency

Rows sharing a `serialize_key` run one at a time, enforced in the claim. Poll registrations default `serialize_key` to their own id, which is the no-overlap rule (use case 11, use case 16) as a special case rather than a bespoke mechanism. Event triggers leave it null for concurrency, or set it per conversation for ordering.

Global limits come from the job queue: `MAX_CONCURRENT_JOBS` (default 4) and `MAX_CONCURRENT_RUNS_PER_WORKFLOW` (default 4), already in `packages/websocket/src/settings-registry.ts`. A 50-comment webhook burst inserts 50 rows and drains at the queue's rate. No new limiter.

---

## 9. Events and auth

One route: `POST /api/triggers/:token`. The token identifies the registration. Auth is per registration:

- **`token`** — the URL token is the credential. Fine for internal and desktop adapters.
- **`hmac_sha256`** — verify `auth_header` against HMAC-SHA256 of the **raw** body with `auth_secret`, compared in constant time. Required for GitHub, Stripe, and most providers. The raw body must be captured before JSON parsing.
- **`none`** — explicit opt-in, warned in the UI.

The route inserts a row and returns `202 {event_id, run_id?}` — `run_id` is present when eager dispatch (§5.3) enqueued the run inline, absent when the queue was saturated and the poller will pick the event up. A duplicate `dedupe_key` returns `200` with the original event's ids and inserts nothing. A disabled or expired registration returns `410` and inserts nothing, so a forgotten webhook endpoint cannot accumulate a backlog that fires on re-enable. Body cap 1MB.

`dedupe_key` comes from a configurable header (`X-GitHub-Delivery`) or a JSON body path (Stripe's `id` — its `Stripe-Signature` header is a signature, not a delivery id) so provider retries do not duplicate runs. Regenerating a registration's token invalidates the old URL; that is the revocation story for a leaked `token`-mode URL.

Client-facing approval links (use case 13) reuse `nodetool_workflow_shares` as the token source instead of minting a second capability system.

### 9.1 Trigger payloads are untrusted

Anyone who can email the agency, comment on a PR, or submit a form can put text in front of an agent that has tools and a wallet. This is the one requirement that is mostly docs and defaults rather than code:

- Templates wrap payloads in a delimited untrusted-content block.
- Triggered runs disable destructive tools unless explicitly enabled on the registration.
- The editor warns when a triggered workflow gives an agent write or shell tools.

---

## 10. Multi-tenancy

`nodetool_secrets` is uniquely keyed `(user_id, key)`, so one human has exactly one `GA_TOKEN`. Eighteen clients need eighteen.

`secret_scope` on the registration makes the resolver try `<scope>/<key>` then fall back to `<key>`. One string on the row, one prefix in the lookup, no new store, and unscoped workflows keep working unchanged.

`tags` covers bulk lifecycle (a churned client's eight triggers disabled in one action). Stamping `registration_id` on the cost ledger gives per-client spend from records that are already written.

Then use case 17 removes the need for the platform to do any of this itself: **registrations are ordinary data a workflow can create, update, and delete.** An onboarding workflow registers a weekly-report trigger per client with that client's config, scope, and tags. Offboarding deletes by tag. Eighteen clients or two hundred, no fan-out feature.

---

## 11. Adapters

Filesystem watching needs a live process, and it belongs in the host rather than the graph. The Electron main process reads `trigger_registrations WHERE kind='file' AND enabled=1`, watches, debounces, waits for writes to settle, and POSTs to the trigger route. It restarts with the app and holds no state the database does not have.

`scope = 'desktop'` marks registrations the cloud cannot serve, so a user who builds a folder-watch workflow and then signs in on the web is told why it is idle instead of wondering.

IMAP polling is `scope = 'cloud'` and is an ordinary polling workflow, not an adapter.

---

## 12. What gets deleted

| Path | Lines |
|---|---|
| `packages/kernel/src/trigger.ts`, `trigger-manager.ts`, `trigger-wakeup.ts` | 784 |
| `packages/kernel/tests/trigger*.test.ts` | 1143 |
| `packages/automation-nodes/src/nodes/triggers.ts` (all but `Wait`) | ~660 |
| `Workflow.hasTriggerNodes()` and its tests | ~40 |
| `trigger_inputs`, `run_inbox_messages`, `run_leases`, `workers` schemas and models | ~200 |

`Wait` stays, with the `setTimeout` clamp fixed and a documented ceiling. `run_node_state` and `run_leases` were deleted on 2026-08-26 along with the whole suspend/resume path — see PRD §11.

The kernel symbols are exported from `@nodetool-ai/kernel`, so they are deprecated in one release and deleted in the next.

Net: roughly 2800 lines removed, roughly 900 added.

---

## 13. Alternatives considered

**Wire up the existing durable-execution substrate.** `run_inbox_messages`, `run_leases`, and `run_node_state` described a durable actor runtime with claim leases and per-node inbox persistence. It solves resume-from-mid-flight, which this design explicitly does not (PRD §N1). Rejected: polling and webhooks retry from the top correctly, and approval flows split into two workflows. `run_inbox_messages` was kept and is now the trigger delivery inbox; `run_leases` and `run_node_state` were deleted on 2026-08-26.

**Keep trigger nodes, fix them.** Rejected. Every fix (cancellation, restart, port binding, persistence) is a step toward reimplementing a scheduler inside the runtime, and it leaves the graph impure and untestable by hand.

**Cron in the process, jobs in memory.** Rejected. The watchdog in `trigger-manager.ts` exists only because in-memory schedules die with the process. Moving the schedule to a row deletes the watchdog, the singleton, the start/stop race, and the abort bookkeeping.

**A separate `wakeups` table for both starts and resumes.** Attractive for Phase 2 symmetry, but it splits scheduling state across two tables in Phase 1 for no gain. Phase 2 can add `kind='resume'` rows to `trigger_events` addressed at `(run_id, node_id)`.

---

## 14. Open questions

1. **Reaper threshold for stuck `claimed` rows.** A 25-minute video render (use case 16) must not be reaped as stuck. Proposal: derive from the job's own timeout rather than a fixed constant.
2. **Does `next_fire_at` from a run need a floor?** A workflow returning `now` loops as fast as the queue allows. Proposal: clamp to 1s and log.
3. **Budget accounting granularity.** `application_budgets` reserves an estimate before the run and reconciles after. Reuse that ledger keyed on `registration_id`, or add a simpler per-period sum over the cost records?
4. **Should `state` write-back require an explicit opt-in on the registration**, so a workflow that happens to have an output named `state` does not silently become stateful? Proposal: keep it automatic — outputs are user-named, so an output called `state` is already deliberate — but display the detected state contract in the Triggers tab when the registration is created, so accidental statefulness is visible rather than silent.
