# Provider webhooks and durable generation recovery

This is an implementation plan. No runtime changes are included.

Make the existing generations ledger the durable record of accepted work,
provider outcomes, saved outputs, and destination attachments. A webhook,
queue poll, or returning caller must recover the same generation without
creating another paid request.

Extend the [generation tracking design](../media-generation-tracking-design.md)
and [generation recovery plan](generation-recovery.md). The first delivery
implements fal. The shared lifecycle supports additional providers through
small provider adapters.

## Evidence from the current implementation

These findings come from source inspection, not newly executed reproductions.
The first implementation step must turn the failure scenarios into tests.

| Finding | Current behavior | Consequence |
|---|---|---|
| F1 | [Runtime fal provider](../../packages/runtime/src/providers/fal-provider.ts) records the provider request ID after `subscribe()` returns. [Node fal utilities](../../packages/fal-nodes/src/fal-base.ts) also return it after subscription finishes. | Neither inspected path durably binds the queue request immediately after submission. |
| F2 | [Receipt scope](../../packages/runtime/src/generation-receipt.ts) is in memory. [Context](../../packages/runtime/src/context.ts) emits lifecycle messages, while [generation tracker](../../packages/execution/src/generation-tracker.ts) follows them and logs failed writes. | Emitting `running` does not guarantee a committed row before a paid call. |
| F3 | The tracker reconciles cost. [Prediction](../../packages/models/src/prediction.ts) sweeps old running rows to `interrupted` based on start time. | There is no output recovery worker, and startup time does not establish which process owns work. |
| F4 | Context can finish with no saved assets after storage errors. Node autosave linkage includes an in-memory map. | Provider success and durable availability are different facts today. |
| F5 | [KIE callback route](../../packages/websocket/src/routes/kie-webhook.ts) resolves [in-memory waiters](../../packages/runtime/src/providers/kie-webhook-registry.ts). | A callback reaching another process or arriving after restart cannot recover a generation through that mechanism. |
| F6 | [UI watcher](../../web/src/lib/websocket/generationWatch.ts) and [agent generation tools](../../packages/agents/src/capabilities/generations.ts) already read the ledger. Destination recovery limitations are recorded in the generation recovery plan. | Keep these readers and extend their state contracts. A webhook alone does not restore a storyboard take or resume an agent stack. |

## Provider-independent design

### D1. One durable generation identity

Keep `predictions` as the generation and cost ledger. Add supporting records
for provider attempts, webhook deliveries, outputs, and attachments. These
records reference a generation and are not a second generation history.

Distinguish the NodeTool generation ID, client request/idempotency key,
provider queue request ID, and provider internal execution ID. Never overwrite
one with another. Persist owner, project, document, workflow/job/node, thread,
tool call, destination resource, and attempt provenance before submission.

Acceptance uses a unique `(user_id, idempotency_key)` constraint and an input
fingerprint. Repeating the key with the same request returns the existing
generation. Different inputs under the same key fail explicitly. A deliberate
new take uses a new key.

### D2. Separate provider outcome, output saving, and attachment

Store explicit internal states and derive the public generation status:

| Dimension | Proposed states | Meaning |
|---|---|---|
| Submission | `accepted`, `submitting`, `submitted`, `submission_unknown` | Whether remote acceptance is known. |
| Provider | `unknown`, `queued`, `running`, `succeeded`, `failed`, `cancelled` | The remote outcome, supported by provider evidence. |
| Outputs | `pending`, `saving`, `ready`, `retrying`, `unavailable` | Whether required outputs are durably retained. |
| Attachment | `pending`, `attached`, `superseded`, `target_deleted`, `retrying` | Whether saved outputs reached their intended resource. |

Expose `pending`, `running`, `recovering`, `completed`, `failed`, `cancelled`,
and `needs_attention` consistently in protocol, queries, CLI, agents, and UI.
`completed` requires durable expected outputs, or a durable structured result
for a non-media operation. Attachment failure remains separately visible and
retryable without hiding the saved generation. Preserve legacy `interrupted`
records for compatibility and inspect eligible ones during backfill.

Transport timeout, disconnected caller, expired worker lease, and failed media
download do not prove provider failure. Persist cancellation intent separately.
If the provider succeeds despite cancellation, retain the result and charge,
show the successful outcome with cancellation history, and do not automatically
select that result in its destination.

### D3. A small lifecycle interface with provider adapters

The generation module owns `accept`, `awaitOutcome`, `cancel`, and `recover`.
HTTP ingress supplies verified deliveries to the same module. Callers do not
manage webhook waits, leases, downloads, or reconciliation schedules.

Keep persistence/orchestration in `packages/execution` and models in
`packages/models`. Inject a durable lifecycle interface into runtime context
through its existing host wiring. Do not add a runtime dependency on execution
or models. Production fal calls must await acceptance and request binding.
An explicit test/probe host may use an ephemeral implementation but cannot
claim restart recovery.

Provider adapters describe supported operations: queued submission, lookup,
result decoding, cancellation, webhook verification, and optional submission
idempotency/history discovery. Capability absence is explicit. Result lookup
and billing reconciliation remain separate operations with separate retries.

The adapter returns a normalized observation containing provider identity,
queue request identity, optional execution identity, provider state, raw-result
reference, and output descriptors. It never writes asset rows or emits UI
completion. Decode live and recovered results through the same model-aware
logic, including multiple files and structured outputs.

Use fal as the first adapter. KIE is the next concrete migration because its
callback path already exists. Preserve other providers' current execution
until their authentication, lookup, and cancellation contracts are verified.
Do not infer webhook support from provider names or invent a universal signing
scheme. A provider without signed callbacks can use a protected callback only
as a wake-up signal and obtain authoritative results through an authenticated
lookup before changing the ledger.

### D4. Durable acceptance, submission, and recovery

Commit acceptance before making a paid request. A leased worker claims it with
an atomic conditional update. Store lease owner, expiry, and a fencing version.
Every subsequent state write must match the current version. Renew leases
during long operations and use indexed, bounded scheduling queries.

Persist `submitting` before network dispatch, then await persistence of the
provider request ID and endpoint immediately after acceptance. A worker that
inherits a `submitting` record must treat submission as ambiguous. Never
blindly repeat that paid POST, including through SDK automatic retries.

For providers without proven submission idempotency, the crash between marking
`submitting` and sending cannot always be distinguished from acceptance with
a lost response. Webhook correlation can close many such gaps, but cannot
guarantee recovery if both the response and callback are lost. Keep the row
visible as `submission_unknown`, attempt supported discovery, and require an
explicit new attempt if identity cannot be established. Prompt similarity is
not sufficient evidence to attach someone else's request.

Polling continues independently of the browser and original agent call.
Persist `next_check_at`, attempt count, last evidence, and actionable errors.
Use per-account rate limits, jitter, bounded concurrency, and provider-aware
retention deadlines. Suggested fal starting policy: check within 15 seconds
while active, back off to at most 60 seconds, and promptly save completed
outputs. These are initial product settings to validate under load.

Change the startup sweep before enabling durable jobs. A new server must not
mark another server's active work interrupted. Recover expired leases and
known remote requests. Retain the legacy path only for generations that are
explicitly outside the durable implementation.

### D5. Durable webhook inbox and one finalizer

Receive, authenticate, validate, and commit the delivery before acknowledging.
Use an inbox uniqueness key scoped to provider account, queue request ID, and
semantic payload hash. Delivery timestamps and transport signatures are not
deduplication identities. Preserve conflicting observations for investigation.

After commit, a worker claims the delivery and merges its observation through
the same compare-and-swap transition logic used by polling and live results.
Repeated delivery causes no duplicate side effects. A delayed running update
cannot regress completed work. Contradictory terminal evidence triggers a
provider recheck and records the conflict instead of using last-write-wins.

Persist the raw result or a durable blob reference before downloading media.
Create stable output identities from `(generation, attempt, output path/index)`
and use deterministic storage keys. Retry partially saved outputs individually.
Commit asset associations and the output-ready transition together. Object
storage is not transactional with the database, so a retry must find/reuse an
uploaded object after a crash between upload and database commit.

Emit completion after commit. WebSocket notifications and in-memory registry
wakes are optimizations. Periodic ledger reads recover missed notifications
across processes. Legacy tracker messages must not overwrite rows now owned
by the durable module or charge the same attempt again.

### D6. Recover every consumer from saved provenance

Return a generation ID at durable acceptance, including for background agent
tools. Keep existing synchronous wrappers by having them wait on that ID.
An agent wait timeout returns the ID and current state, not a retry instruction.
Later turns receive the existing generation snapshot and can await or recover
it before submitting more work.

Persist destination intents on the server. Use unique generation/output/target
attachment keys for storyboard takes, timeline results, and node history.
Attach an old result as history without overwriting a newer selected take.
Deleted destinations leave outputs accessible through generation history and
assets. Rehydrate pending work by user/project/document/thread on reopen,
focus, reconnect, and another device, even with no localStorage entries.

Extend the existing lookup and watcher paths, plus chat generation snapshots,
to expose output-saving and attachment errors. Use TanStack Query for server
state and the existing WebSocket manager for notifications. Enumerate actual
consumers during implementation before claiming coverage of every UI surface.

Full automatic resumption of arbitrary agent/workflow stacks remains a separate
checkpointing project. This delivery guarantees discoverable generation results
and destination recovery without requiring that continuation project.

## Concrete fal implementation

### fal contracts to encode

Queue submission supports `webhookUrl` and returns `request_id`. Queue states
are `IN_QUEUE`, `IN_PROGRESS`, and `COMPLETED`. Inspect errors and fetch the
result before interpreting completion as success. Client waiting can expire
while inference continues. Cancellation acceptance does not guarantee stopping
an already running request. Media must be copied before its configured expiry.
[fal queue documentation](https://fal.ai/docs/documentation/model-apis/inference/queue)

Callbacks carry `request_id`, `gateway_request_id`, `OK`/`ERROR`, and payload or
payload errors. Queue identity is `request_id`; the gateway identity may differ
after retries. Acknowledge with 2xx. Delivery retries end at result expiry
(about one hour, or six minutes for payloads ≥10 KB), with at most 31 retries.
Redirects and private destinations are unsupported. Verification uses Ed25519,
the four `X-Fal-Webhook-*` headers, a ±300-second timestamp window, and the
newline-joined request ID, user ID, timestamp, and raw-body SHA-256 hex digest.
Keys come from `https://rest.fal.ai/.well-known/jwks.json` and must not be cached
over 24 hours.
[fal webhook documentation](https://fal.ai/docs/documentation/model-apis/inference/webhooks)

The decisions below are NodeTool's proposed implementation, not additional fal
guarantees. Verify undocumented identity and submission-retry behavior in
contract tests before rollout.

### D7. Use explicit queue submission in both fal paths

Add shared queue operations under `packages/runtime/src/providers/`, then route
the runtime provider and `fal-nodes/src/fal-base.ts` through them. The generated
[factory](../../packages/fal-nodes/src/fal-factory.ts) and
[dynamic nodes](../../packages/fal-nodes/src/fal-dynamic.ts) must participate in
the same acceptance and binding interface. Keep existing model input building
and output type behavior.

Replace hidden submit-and-wait behavior with this sequence:

1. **A1.** Commit the generation and attempt, including a random callback
   correlation token, owner/credential reference, exact endpoint, and versioned
   decoding information. Store an encrypted token for resumed submission and
   a hash for ingress lookup. Redact the URL from logs.
2. **A2.** Submit with the configured final HTTPS callback URL, proposed as
   `/api/providers/fal/webhook/:token`. Inspect the installed SDK's POST retry
   behavior and disable unsafe submission replay. Retrying status/result GETs
   is separate from submitting again.
3. **A3.** Await binding of returned `request_id` and exact endpoint before
   waiting. Keep supported status/result/cancel locators as metadata, but build
   authenticated requests from trusted origins and stored endpoint identity.
   Do not send credentials to callback-supplied URLs.
4. **A4.** Poll for progress if needed while webhook and recovery workers run.
   Feed every final result through the same decoder and finalizer. Detaching a
   waiter must not cancel remote work unless cancellation was explicitly asked
   for by the generation owner.

Keep `fal_ai` as the stored provider identifier. Resolve the existing
`FAL_API_KEY` credential explicitly rather than mechanically deriving
`FAL_AI_API_KEY`. Persist a credential/account reference, never the secret.
Managed platform keys and user-owned keys must resolve through their original
ownership path after a restart or rotation.

### D8. Authenticate the fal ingress and bind it safely

Add `packages/websocket/src/routes/fal-webhook.ts`, register it in the server,
and add a method/path-specific exemption in
[public routes](../../packages/websocket/src/lib/public-routes.ts). Exempt only
the callback from session authentication. Require provider verification there.

Capture a bounded raw body inside the route's encapsulated Fastify plugin.
Do not reserialize JSON for verification or change other routes' parsers.
Use Node's native crypto with validated JWKs. Enforce strict header formats,
signature lengths, and timestamp parsing. Cache keys, coalesce refreshes, and
permit one bounded refresh after an unknown-key/signature failure. Invalid
signatures fail closed. Temporary key-fetch or persistence failure returns a
retryable server error. Apply body-size and rate limits suitable for the
measured model envelopes and alert on rejected oversized deliveries.

The callback token locates a preaccepted attempt. It is correlation protection,
not a substitute for provider authentication. Verify the signed body before
reading its outcome. Match known queue IDs, store gateway IDs separately, and
validate the relationship of the signed header ID to body IDs with actual fal
fixtures rather than assuming all three always match.

Bind the delivery to the attempt's stored provider account. Validate fal user
identity where known. For ambiguous/new request binding, use an authenticated
queue lookup through the attempt's original credential and stored endpoint
before allowing completion. Never derive a NodeTool user from webhook fields.
Retain a verified but unresolved delivery in the inbox for reconciliation.

If a callback beats the submit response, its token finds the already committed
attempt. Bind the queue ID atomically after validation. A later submit response
must agree or create a visible conflict. Keep a uniqueness constraint on
`(provider, account_ref, provider_request_id)` so another token cannot adopt
an already bound request. Do not use prompts or timestamps for attribution.

Return 200 for a committed delivery or recognized duplicate. Malformed or
invalidly authenticated requests receive 4xx. Database unavailability receives
503. Never acknowledge before durable storage or wait for media downloads in
the HTTP handler.

### D9. Normalize fal outcomes and reconcile independently

Use webhook `OK` as provider-success evidence, then validate and save the
model-specific result. A missing payload or `payload_error` schedules queue
result retrieval and preserves the original envelope. Record `ERROR` with its
structured provider details. Polling uses queue state plus the result/error
response, not just the word `COMPLETED`.

Move the existing model-aware output parsing into reusable decoders where
needed. Save image arrays, video, audio, mesh files, and structured outputs
according to each operation's expected output contract. The limited URL
extractor in [fal history](../../packages/runtime/src/providers/fal-generations.ts)
is not sufficient as the general recovery decoder. Preserve unknown valid
results for later repair instead of silently completing with no outputs.

Download provider output URLs through `fetchExternalMedia`, including redirect
validation. Record missing/expired media as `outputs.unavailable` and expose
the known provider success, request ID, and cost. Recovery retries download or
decoding, never generation.

Continue using the existing cost reconciler independently. Give cost updates
field-specific conditional writes so they cannot replace output state or other
metadata from a concurrent finalizer. Webhook processing does not invent a
billed amount and billing evidence does not prove output success.

### D10. Deployment and backfill

Enable callbacks only when the configured public ingress writes the same
authoritative ledger as the submitting worker. Hosted deployments need shared
storage, durable database access, and continuously running recovery workers.
Rolling deploys must stop claiming work, finish or release bounded tasks, and
let expired leases recover safely.

Local/Electron installations use queue polling and restart recovery unless a
public callback path reaches their owning backend. Pointing callbacks at the
hosted server does not synchronize a separate local database. An authenticated
cloud relay requires its own design. Local downtime past provider retention
cannot be promised lossless recovery without an always-on receiver.

Roll out additively: migrate schemas, deploy readers and safe sweep behavior,
enable durable fal acceptance for a canary, then enable callbacks. Leave polling
available throughout. On rollback, disable new callback submissions while
continuing inbox processing and recovery for accepted jobs. Do not deploy old
writers that overwrite the new lifecycle state.

Backfill eligible fal rows with known request IDs and endpoints through queue
lookup first. Optional platform history lookup uses the existing history client
when its required credentials are available. Keep billing reconciliation
separate and preserve unknown outcomes. Unattributed provider history remains
an operator-visible candidate, not an automatically adopted user generation.

## Implementation sequence and verification

| Step | Work | Acceptance evidence |
|---|---|---|
| A5 | Reproduce F1–F4 using controlled provider responses, persistence failures, and process termination. Inventory fal submit callers and generation readers. | Failures demonstrate lost binding, premature settlement, or missing recovery in the existing implementation. |
| A6 | Add models, leases, durable acceptance, states, unique constraints, and migration/backfill support. Update both SQLite/PostgreSQL schemas, bootstrap DDL, exports, and migration chain. | Concurrent acceptance deduplicates. Both dialects enforce identity and lease constraints. Database failure prevents a paid submission. |
| A7 | Implement common finalization/output persistence and move both fal submit paths to explicit submit/bind/wait. Protect durable rows from legacy tracker writes. | Restart after submission recovers the same request. Multiple outputs and partial storage retries preserve one asset per output. |
| A8 | Add fal verification and inbox processing. | Signed success/error fixtures, changed raw bytes, missing headers, stale/future timestamps, key rotation/outage, wrong tenant/token, ID mismatch, and duplicate deliveries behave as specified. |
| A9 | Add queue recovery worker, lease-aware sweep, independent billing updates, and cancellation intent. | Lost callback, callback-before-bind, webhook/poll races, two workers, and late success after cancel converge without duplicate paid calls or regressed status. |
| A10 | Persist destination intents and update agent, CLI, lookup, and UI readers. | Reopened chat/board, cleared localStorage, another device, disconnected socket, deleted target, and newer selected take retain correct outputs and attribution. |
| A11 | Canary, backfill, and operational checks. | Controlled live fal request proves callback routing, queue-ID correlation, saved media, ledger lookup, and eventual billing lookup where authorized. KIE migration follows under its own verified adapter contract. |

Use database and HTTP boundaries in tests. Kill a separate worker after
acceptance, during ambiguous submit, after request binding, after inbox commit,
after each output upload, before asset commit, and before destination attachment.
Restart a different worker and assert identity, saved outputs, and no additional
paid POST. Prove a new failure check fails before relying on it.

Extend existing generation tracker, seam, fal provider, agent generation, and
browser recovery suites. Add a deterministic recovery selfcheck to the
[registry](../../packages/cli/src/harness/registry.ts) that verifies restart and
duplicate-delivery behavior without a paid provider call. Keep the live canary
separate from routine CI. Exercise a large recovery backlog to verify bounded
queries, fair scheduling, and no duplicate concurrent downloads.

Track inbox acknowledgement latency, oldest pending delivery, oldest due
recovery, ambiguous submissions, expired leases, output-save failures, result
expiry, attachment backlog, conflicts, and cost-reconciliation lag. Log
generation/attempt/provider request IDs while redacting tokens, credentials,
prompts, and signed media URLs. Alert when pending work approaches its recovery
deadline. Provide operator inspection and replay by generation or delivery ID
with ownership checks, without exposing raw payloads through ordinary UI logs.

After implementation changes, run the repository's required checks:

```bash
npm run test:affected
npm run typecheck
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

Also run affected schema/migration parity and provider/consumer suites if the
selection misses their dependency. Update the
[URL egress inventory](../url-egress-inventory.md) and generation design guidance
when implementation changes their contracts. The current planning-only change
requires document/link checks, not application test execution.
