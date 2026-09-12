# Generation recovery

Closing a browser must not discard a paid generation. Reopening a storyboard
should restore its pending renders and completed takes. A later agent turn
should find earlier generation records even when its tool response was lost.

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
continues. They do not make the execution process durable.

Storyboard request-to-shot links still live in localStorage. Clearing browser
storage or opening another device loses those links. A browser also lands the
result onto its local board before the board's ordinary server save completes.
That gap needs a server-owned attachment operation.

The generation ledger stores results independently of a socket. However, the
[tracker](../../packages/execution/src/generation-tracker.ts) reconciles provider
**cost**, not output media. Its startup sweep marks abandoned rows interrupted.
The [runtime](../../packages/runtime/src/context.ts) currently receives provider
receipts through the running call, so a server crash can occur after provider
submission but before its request ID is durably stored. A provider may finish
and charge for that request despite an interrupted local record.

Chat replay sessions are process-local. Persisted assistant and tool messages
survive a restart, but replaying those messages does not resume the execution
stack. Tools that require the browser also cannot complete while it is absent.

## Design for restart and device recovery

1. **D1. Persist acceptance before submission.** Extend the existing generation
   record with its owning project, target resource and shot, render inputs,
   attempt number, and a caller-supplied idempotency key. Commit an accepted
   record before submitting provider work. Repeating the same acceptance
   request returns that generation. A deliberate new take gets a new key.
2. **D2. Execute through leased workers.** A worker claims accepted work with a
   renewable lease. Persist the provider request ID immediately after submission.
   Recovery after lease expiry polls that request and resumes downloading its
   output. It must not submit another paid request automatically. If submission
   was ambiguous and the provider offers no idempotency or lookup, expose that
   uncertainty for review.
3. **D3. Attach results on the server.** Persist media in owned storage, then
   atomically associate it with the generation and destination take. Use
   generation ID as the unique attachment key. A recovered older render can be
   retained as a take without changing a newer selected take. Retry attachment
   independently of provider generation. The UI reads the resulting board and
   generation records on reconnect, focus, or another device.
4. **D4. Persist agent continuations.** Record each outstanding generation and
   the step awaiting it before yielding. Resume from that checkpoint when it
   settles. Browser-only tools should enter a waiting-for-client state rather
   than silently aborting the run. Budget exhaustion remains a visible pause or
   stop with saved results, rather than a reason to discard generations.

Verification for that design must kill a worker after acceptance, after provider
submission, after asset storage, and before board attachment. Each case must
retain one generation identity, avoid duplicate provider submission, and attach
one take after recovery. Also test two workers competing for a lease, returning
on another device, unavailable storage, and a new render replacing the selected
shot while an older one finishes.

The existing [generation tracking design](../media-generation-tracking-design.md)
provides the ledger and agent query APIs. Extend that record rather than creating
an independent generation history that can disagree with it.
