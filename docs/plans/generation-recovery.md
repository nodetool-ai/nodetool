# Generation recovery

Closing a browser must not discard a paid generation. Reopening a storyboard
should restore its pending renders and completed takes. A later agent turn
should find earlier generation records even when its tool response was lost.

## Current implementation

The durable generation path persists acceptance before provider submission and
uses a generation idempotency key plus input fingerprint. Each attempt has a
lease, attempt number and provider identity. The generation record exposes
submission, provider, output and attachment state separately. A public
`completed` status is emitted only after output state is `ready`; provider
success while saving is `recovering`, and unavailable or retrying work is
`needs_attention`.

FAL uses one explicit queue submit followed by bind and wait. The provider
request id is recorded after the submit response and before status polling.
When a valid HTTPS `NODETOOL_PUBLIC_URL` is configured, the request includes a
tokenized callback URL at `/api/providers/fal/webhook/:token`. The route keeps
the raw body, verifies FAL's Ed25519 headers and timestamp, and commits a
deduplicated inbox row before acknowledging the request. The JWK cache is
bounded and refreshes are coalesced. A local server without a reachable HTTPS
base does not advertise a callback and uses FAL queue polling instead.

The recovery worker consumes inbox deliveries before polling recoverable FAL
attempts. Both paths use lease-fenced updates. Output and attachment writes
are separate lifecycle steps, so the generation record can report a provider
result that has not yet become a ready attachment. The code does not claim
that every provider output is recoverable after a restart.

Cancellation is an intent for durable work. `cancel_requested_at` is persisted
and the recovery worker may call the provider's cancel operation once it has a
bound request. The API does not report provider cancellation or close the row
until that outcome is observed. Local in-process work can still be aborted by
the generation registry.

## Reproduced disconnect failures

- **F1.** The [chat registry](../../packages/websocket/src/chat-turn-registry.ts)
  aborted a detached agent after ten minutes, independently of its execution
  budget. The default disconnect timeout is now disabled. An explicit positive
  `NODETOOL_CHAT_DETACH_GRACE_MS` still enables an operator-selected timeout.
  Stop, turn budgets, and shutdown cancellation remain available.
- **F2.** The [storyboard store](../../web/src/stores/storyboard/StoryboardGenerationStore.ts)
  dropped pending requests after thirty minutes and kept only the newest
  sixty-four. Pending requests now remain until settlement, deletion of their
  shot, or explicit removal. Polling has no storyboard deadline. A late result
  cannot replace a newer render of the same shot.
- **F3.** The [generation watcher](../../web/src/lib/websocket/generationWatch.ts)
  expired requests before consulting the database. It now reads the saved
  outcome first, including after a browser wakes past a caller's deadline.
- **F4.** A lookup containing more than the server's request-id limit silently
  omitted its tail. The [client lookup](../../web/src/lib/websocket/lookupGenerations.ts)
  now partitions requests into bounded batches and retries unresolved batches
  through the existing watcher.
- **F5.** The [chat handler](../../packages/websocket/src/session/chat-turn.ts)
  did not automatically supply saved generations to a later turn. It now reads
  recent records scoped to the authenticated user and conversation. The agent
  receives generation IDs, status, model, originating tool-call ID, and asset
  references. It can inspect or await an existing generation before paying for
  another. This snapshot is refreshed per turn and is not saved into chat
  history or the system prompt.
- **F6.** A status lookup had no reply timeout. Losing its socket could prevent
  every subsequent poll. Lookup requests now time out and release their
  subscriptions, allowing the next poll to retry. A reopened storyboard can
  install its watcher while disconnected.

These cases have deterministic tests in the
[storyboard recovery suite](../../web/src/stores/storyboard/__tests__/StoryboardGenerationReattach.test.ts),
[watcher suite](../../web/src/lib/websocket/__tests__/generationWatch.test.ts),
[lookup suite](../../web/src/lib/websocket/__tests__/lookupGenerations.test.ts),
[RPC timeout suite](../../web/src/lib/websocket/__tests__/rpcRequest.test.ts),
[chat registry suite](../../packages/websocket/tests/chat-turn-registry.test.ts),
and [chat handler suite](../../packages/websocket/tests/chat-turn-handler-errors.test.ts).

## Remaining durability boundaries

The changes above cover a browser leaving and returning while server execution
continues. They do not checkpoint arbitrary agent or workflow execution.

FAL storyboard keyframe and clip requests now persist their destination intent.
The server saves recovered output as shot history and selects it only when the
request still owns selection. Local browser state remains an optimization.
Timeline destinations, node history, and providers other than FAL still need
their own attachment adapters.

The generation ledger now retains FAL provider output independently of a
socket. A bound provider request can be recovered through a verified webhook or
authenticated queue lookup. The unavoidable crash window is an ambiguous FAL
submission whose POST may have reached the provider before its request ID was
committed. That attempt remains `submission_unknown` and is never replayed
blindly.

Chat replay sessions are process-local. Persisted assistant and tool messages
survive a restart, but replaying those messages does not resume the execution
stack. Tools that require the browser also cannot complete while it is absent.

## Design for restart and device recovery

1. **D1. Persist acceptance before submission.** The durable path now records
   the generation identity, input fingerprint, attempt number and provider
   request identity before it waits for provider output. A deliberate new take
   still needs a new idempotency key.
2. **D2. Execute through leased workers.** The recovery worker claims accepted
   work with a renewable lease. FAL persists its provider request ID immediately
   after submission, then binds and polls it. Recovery does not replay a paid
   submission. An ambiguous submission remains `submission_unknown` until it
   can be resolved.
3. **D3. Attach results on the server.** Output and attachment records provide
   separate durable states and idempotency keys. A finalizer can persist media
   and attach it after provider completion. The current path does not promise
   that arbitrary provider media or every destination attachment is recoverable.
4. **D4. Persist agent continuations.** This remains separate work. Generation
   rows do not checkpoint an agent's tool loop, workflow stack, browser state or
   budget. A later design must define those checkpoints before claiming that a
   paused execution can resume.

Verification for that design must kill a worker after acceptance, after provider
submission, after asset storage, and before board attachment. Each case must
retain one generation identity, avoid duplicate provider submission, and attach
one take after recovery. Also test two workers competing for a lease, returning
on another device, unavailable storage, and a new render replacing the selected
shot while an older one finishes.

The existing [generation tracking design](../media-generation-tracking-design.md)
provides the ledger and agent query APIs. Extend that record rather than creating
an independent generation history that can disagree with it.
