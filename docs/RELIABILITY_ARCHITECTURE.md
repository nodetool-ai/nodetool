# Reliability Architecture: One Execution Core, Golden Journeys, Injected Faults

> Status: proposal. Author: Principal Reliability Engineering review, 2026-07.
> Scope: the architectural investment that buys the most stability over the
> next several years, designed in enough depth to start building.
> Execution plan: [RELIABILITY_TASKS.md](RELIABILITY_TASKS.md) — the same
> work cut into six parallel tracks of one-PR tasks.

NodeTool's recent failures — CLI runs behaving differently from WebSocket
runs, packaged Electron builds dying with green CI, half-open sockets,
fake workers accepting frames real workers reject, orphaned actors,
provider drift — are not coverage gaps. They are **drift between execution
surfaces and unvalidated boundaries**, and no amount of additional unit
testing fixes either. This document names the root causes, picks one
primary investment, and designs it.

The one-paragraph verdict up front: **the highest-leverage investment is a
Reliability Harness that runs a small suite of golden workflow journeys
through every real execution surface, differentially compares the message
streams, asserts lifecycle invariants the kernel currently only logs, and
injects faults at the five seams where the real world differs from tests.
Its prerequisite — and the first PR — is collapsing the eight hand-wired
`WorkflowRunner` construction sites into one `ExecutionSession` facade and
making the streaming protocol runtime-validated.** Everything else in this
document is the design of those two things.

---

## 1. Why the unit tests didn't catch these bugs

The unit tests are good. `packages/kernel/tests/` has ~50 files including
`controlled-cancel-hang.test.ts`, `execution-reliability.test.ts`, and
mutation-kill suites. They didn't catch the recent failures because those
failures live in places unit tests structurally cannot reach:

**The bugs are in the wiring, not the units.** All surfaces call the same
`WorkflowRunner` (`packages/kernel/src/runner.ts`), but each surface wires
it by hand. The CLI (`packages/cli/src/nodetool.ts:751`), the debug
harness (`packages/cli/src/debug/server-runner.ts:101`), the WebSocket
runner (`packages/websocket/src/session/job-execution.ts:1305`), the
headless job runner, the HTTP API, the MCP server, and the browser
workflow-runner each independently repeat graph hydration, executor
resolution, param seeding, and result handling. A unit test exercises the
kernel; it cannot notice that the CLI forgot `hydrateGraphNodeFlags` (the
in-code comment says exactly what happens: "or streaming nodes run as
one-shots") while the WS surface remembered it. "CLI execution differed
from websocket execution" is this, mechanically.

**The bugs are at unverified boundaries.** The entire streaming protocol —
~30 message types in `packages/protocol/src/messages.ts` — is TypeScript
interfaces only. Zero runtime validators, zero type guards. The server's
`receiveMessage` blind-casts `unpack(...) as Record<string, unknown>` and
narrows with hand-rolled `typeof` checks. TS types are erased at the
msgpack boundary, at the Python stdio boundary, at the mobile client, and
at any non-JS consumer. A fake worker that "accepts protocol shapes real
workers reject" is only possible because nothing executable defines the
shape. Unit tests on either side of an unspecified boundary both pass
while disagreeing with each other.

**The bugs are in environments tests don't run in.** The sharp/@img skew
that killed `v0.7.1-nightly.20260728.713` was invisible to every test
because tests run against `node_modules`, not the flat `_modules/` staging
that `scripts/bundle-backend.mjs` produces. The release smoke-launch
missed it too, because it watched the Electron main process, which
survives its backend child dying. Packaged-artifact bugs require running
the packaged artifact.

**The bugs are emergent timing, and the kernel deliberately tolerates
them.** `_checkPendingInboxWork` (`runner.ts:1319`) detects data loss
after all actors settle — and logs a warning. Backpressure release
(`inbox.ts:571`) exists because a parked producer once hung
`Promise.allSettled` forever. Three separate control-response hang guards
exist. These are known failure classes with advisory-only detection: unit
tests assert the happy path around them, and production hits the warning
path nobody asserts on.

**The test doubles are flattering.** `FakeProvider`/`ScriptedProvider`
return well-formed shapes by construction. The Python WS test helper
speaks msgpack-over-WS with no length prefix, while the real stdio bridge
is length-prefixed — and there is no stdio fake at all, so the framing,
spawn-timeout, and EPIPE paths of `python-stdio-bridge.ts` are untested.
Provider tests are 87 hand-written per-provider files; nothing enumerates
the registry and asserts one contract, so a new provider ships with a
different error shape and no test fails.

The pattern: unit tests verify components against their author's mental
model. The recent bugs are disagreements *between* mental models. Only
tests that run the real components against each other can see those.

## 2. The highest-leverage investment

One investment, two layers, in dependency order:

**Layer 1 (prerequisite): a single `ExecutionSession` facade plus a
runtime-validated protocol.** Collapse the eight construction sites into
one package that owns hydration, executor resolution, param/streaming
seeding, cancellation, timeout, persistence hooks, and message emission.
Generate Zod schemas for every `ProcessingMessage` and validate at every
process boundary. This removes the drift *mechanism*; without it, the
harness would forever chase symptoms.

**Layer 2 (the harness): golden workflow journeys executed through the
real production stack on every surface, with differential comparison and
fault injection.** Not a new test framework — a promotion and unification
of infrastructure the repo already has: the hermetic
`e2e-server.ts` + `fake-runtime.ts`, the `nodetool debug` harness whose
`diff.ts` already compares kernel-vs-browser runs, the e2e_runner
Playwright suite, and `backend:smoke`. Today these are separate,
partially nightly, and none injects faults. The harness makes them one
system with teeth.

Why this beats the alternatives considered:

- *More integration tests per package* — still tests components against
  local assumptions; doesn't touch cross-surface drift.
- *A full staging environment with synthetic traffic* — right instinct,
  wrong cost for a local-first product; most NodeTool instances are a
  laptop, not a fleet. The harness delivers staging-grade confidence
  hermetically, in CI, per PR.
- *Formal protocol specification (protobuf/JSON-schema-first)* — the Zod
  layer gets 90% of the value without a wire-format migration; revisit
  IDL-first only if a non-TS client beyond the Python worker appears.

## 3. Should there be golden journeys through the production stack? Yes.

Unambiguously. The repo has already proven the approach piecemeal: the
`bundle` CI leg (`backend:smoke`) was added after a packaging incident and
has been catching what layout checks can't; the e2e-runner suite exercises
the real server, real kernel, real ReactFlow canvas, real WS protocol
hermetically. The gap is that these are not organized as *journeys* —
named, versioned, cross-surface, invariant-asserting scenarios — and the
journey-shaped suite that exists (`user-journeys.yml`) runs nightly with
`continue-on-error: true`.

A golden journey is defined as: **a fixed workflow + a scripted
interaction + an expected message-stream shape + a set of invariants,
executed through a real entry point with no mocked internal seams.** Only
the world's edges are faked: provider HTTP (cassettes/scripted), external
media, the clock where determinism demands it. Everything from the entry
point inward — protocol parsing, job queue, kernel, actors, inboxes,
persistence, streaming — is production code.

## 4. Journey structure

Each journey is a directory under `reliability/journeys/<name>/`:

```
reliability/journeys/streaming-llm-chat/
  journey.json        # manifest: workflow ref, params, interactions,
                      #   surfaces, fault matrix, timeout budget
  workflow.json       # the graph (or a ref to a shipped example)
  interactions.json   # scripted actions: run, stream_input, cancel-at-<event>,
                      #   reconnect-at-<event> — same shape as `app debug --interact`
  expected/
    stream.shape.json # normalized expected message sequence (see §12)
    outputs.json      # terminal outputs after normalization
```

Rules that keep journeys trustworthy:

- **Declarative, not imperative.** A journey is data interpreted by the
  harness, so the same journey runs on every surface without per-surface
  test code. Per-surface *drivers* exist once, in the harness.
- **Event-anchored, not time-anchored.** "Cancel after the second
  `chunk`", never "cancel after 500 ms". Wall-clock anchors are the root
  of flake, and per `docs/DEVELOPMENT_STANDARDS.md`, flaky tests are bugs.
- **Normalized comparison.** Timestamps, ids, durations, and asset URLs
  are normalized before diffing; ordering is compared per-node-channel,
  not globally, because the actor model legitimately interleaves.
- **Every journey states its invariant set explicitly** (§6) and the
  harness refuses a journey that asserts nothing beyond "completed".
- **A declared golden decides the verdict.** `assertions.outputs` /
  `assertions.streamShape` compare every surface's record against
  `expected/` and fail the journey on a mismatch — invariants and the
  cross-surface diff both pass when every surface returns the same wrong
  answer. Faulted runs skip the comparison (and say so): a golden
  describes the unfaulted contract. `nodetool reliability update-goldens
  <journey>` recaptures the fixtures from an unfaulted kernel run.

## 5. Which workflows belong in the suite

Fifteen to twenty journeys, chosen for failure-mode coverage rather than
feature coverage. Seed set, mapped to the recent bug classes:

1. **Linear text pipeline** (input → transform → output) — the baseline;
   if this diverges across surfaces, everything is suspect.
2. **Streaming LLM chat** with chunked output and `stream_input` /
   `end_input_stream` incremental seeding — exercises the WS-only seeding
   path that no other surface has (the kind of asymmetry §7 exists to
   kill).
3. **Fan-out/fan-in DAG** with a slow branch — completion detection,
   EOS dedup, `Promise.allSettled` semantics.
4. **Streaming producer → slow consumer** with a finite `bufferLimit` —
   backpressure park/release (`inbox.ts:571`), the "producer never
   returns" hang class.
5. **Controlled/agent node with tool calls** — the control-response hang
   guards (`runner.ts:1259`, `:1778`).
6. **Mid-run cancellation** at three anchors: while queued, during a node,
   during streaming — including the tRPC DB-cancel/start race the code
   comments at `session/job-execution.ts:1393` describe.
7. **Python-node workflow** over the real stdio bridge against the real
   worker (nightly ring) and a *faithful* length-prefixed fake (PR ring) —
   closing the "no stdio fake exists" gap.
8. **Provider failure mid-stream** — provider returns 429/500/truncated
   stream after N chunks; asserts terminal `job_update failed` with a
   sane error, no orphan actors.
9. **Client reconnect mid-run** — kill the socket after node 2 of 4;
   assert the client's queue-during-backoff behavior
   (`WebSocketManager.ts:249`) and that the run's terminal state is
   observable after resubscribe.
10. **Concurrent jobs beyond `MAX_CONCURRENT_JOBS`** — queue, drain, slot
    handoff (`startingJobs`→`activeJobs`), the leaked-slot class the code
    comments memorialize.
11. **Mini-app journey** — an `ApplicationBundle` through the shared
    `app-runtime` fold on web, mobile (jest), and headless `app debug`;
    asserts the fold's job-id isolation.
12. **Suspend/resume trigger workflow** — `WorkflowSuspendedError` path,
    durable inbox, trigger wakeup.
13. **Error-in-one-branch** — sibling branches complete, failed node
    reported, `finalize()` ran everywhere.
14. **Malformed-protocol journey** — client sends near-valid frames
    (wrong field type, unknown `type`, oversized, truncated msgpack);
    asserts rejection without connection or job corruption.
15. **Packaged-backend journey** — journeys 1, 2, and 7 executed against
    the staged bundle's `server.mjs` (extending `backend:smoke` from
    "boots and serves /health" to "runs real workflows").

Each shipped example workflow that `scripts/smoke-examples.mjs` curates is a
candidate for promotion; journeys should prefer shipped examples so the
suite doubles as product validation.

## 6. Invariants to assert

Journeys assert invariants *in addition to* expected outputs. These are
the checks that convert today's advisory logging into failures:

**Lifecycle.**
- Every `node_update running` is eventually paired with exactly one
  terminal `node_update` (`completed`/`failed`/`cancelled`) for that
  invocation. No node is left `running` after `job_update` terminal.
- Terminal precedence is exactly cancel > suspend > failed > completed
  (`runner.ts:625`) — asserted, not assumed.
- Exactly one terminal `job_update` per run, and nothing follows it on
  that job's stream. A driver records repeated frames rather than
  dropping them; a repeat its surface documents (the ws-server's eager
  `running`/`cancelled` acks and its authoritative terminal snapshot) is
  tagged `redundant` and discounted here and in the cross-surface diff.
  Any other duplicate is untagged, and fails.

**Cleanup and leaks.**
- `_checkPendingInboxWork` finding pending work is a journey **failure**,
  not a log line. The harness runs the kernel with a strict mode flag
  (§12) that surfaces it.
- After the run: zero live actors, zero pending control responses, zero
  timers beyond the trigger timeout, Python bridge has zero pending
  requests, WS slot accounting returns to zero
  (`activeJobs`/`startingJobs` empty), no growth in open handles across
  repeated journey iterations (leak journeys run N=20 and compare).
- Cancellation completes within a budget (e.g. 5 s) and `finalize()` ran
  for every started actor.
- The counters above are **measured** — the kernel driver reads them off
  `ExecutionSession.resourceCounters()`, the ws-server driver off the
  runner's `slotCounters` once the connection is gone. A journey that
  declares `cleanup-leaks` on a surface whose driver produces no post-run
  snapshot fails on that: "nothing measured" must not read as "no leaks".

**Determinism.**
- Two runs of the same journey with the same cassettes produce identical
  normalized streams per node-channel. Nondeterminism outside declared
  normalization fields is a failure — this is what makes drift visible.

**State transitions.**
- Client `WebSocketManager` transitions only along its declared state
  machine (`WebSocketManager.ts:95`); the harness driver records
  transitions and diffs against the machine.
- Job table state (when `persistence: "job"`) matches the final
  `job_update` — no "resurrected" cancelled jobs.

**Protocol correctness.**
- Every frame crossing every boundary validates against the generated
  Zod schema — both directions, all surfaces. One shared assertion, run
  everywhere, kills the fake-worker-accepts-what-real-workers-reject
  class permanently.
- Bridge frames respect `BRIDGE_PROTOCOL_VERSION` negotiation.

**Resource/flow control.**
- Outbound WS buffer never exceeds the configured cap; sends beyond it
  wait for drain (asserted via the health layer's counters).
- Inbox depth never exceeds `bufferLimit` when set.

## 7. One execution implementation across surfaces? Yes — and it's closer than it looks.

The kernel is already shared; the drift is in the ~200 lines each surface
hand-writes around it. The answer is not "merge the surfaces" — the WS
runner legitimately needs streaming, queueing, and persistence the CLI
doesn't — it is **one facade that owns everything below the transport**:

```
@nodetool-ai/execution  (new package, between kernel and its consumers)

  ExecutionSession.create({
    graph,                 // raw saved JSON — hydration happens HERE, once
    registry, bridgeFactory,
    params | inputStream,  // both seeding modes for every surface
    persistence: JobPersistenceHook | null,
    limits: { runTimeoutMs, nodeTimeoutMs, bufferLimit },
  })
  session.messages         // AsyncIterable<ProcessingMessage> — validated
  session.pushInput(...) / session.finishInputStream(...)
  session.cancel(reason)   // the ONLY cancel; timeout = cancel("timeout")
  session.result           // Promise<TerminalResult>
```

Surfaces become thin adapters: the WS runner maps commands to session
calls and pumps `session.messages` through its transform pipeline; the
CLI awaits `session.result`; the debug harness's `withTimeout` — which
today *abandons* a still-running kernel — becomes `session.cancel`, fixing
a real leak. Executor resolution (currently copy-pasted three times),
`hydrateGraphNodeFlags` (currently remembered by some callers), and
output-name rewriting (currently WS-only) move inside and cannot be
forgotten.

Mobile and web clients stay consumers of the WS protocol — they should
never embed the engine — but their *message folding* is already unified in
`@nodetool-ai/app-runtime/fold.ts`, whose header comment ("existed three
times and they drifted") is this document's thesis proven in miniature.
Extend that precedent: the graph-editor message reduction in web should
fold through a shared reducer the same way.

## 8. Eliminating drift structurally

A facade stops drift only if bypassing it is harder than using it:

1. **Dependency lint.** Extend the existing key-boundary/coupled-dep CI
   guards (`quality-checks.yml` `deps` leg): only `@nodetool-ai/execution`
   may construct `WorkflowRunner`. Direct construction anywhere else
   fails CI.
2. **Schema-first protocol.** `messages.ts` becomes generated output:
   Zod schemas are the source, TS types are `z.infer`, and a generated
   JSON Schema artifact is published for the Python worker to validate
   against in *its* tests. Adding a message type without a schema is
   impossible because the type no longer exists separately.
3. **Contract tests from the registry, not by hand.** One parameterized
   suite enumerates `provider-registry.ts` and asserts the `BaseProvider`
   contract (streaming shape, error taxonomy, cost fields, cancellation)
   against every registered provider via cassette; a new provider is
   covered on registration or fails CI. Same pattern for node executors
   and for bridge transports (stdio and WS fakes generated from one
   framing spec).
4. **The differential journey run is the drift alarm.** Surfaces sharing
   one facade can still diverge in their adapters; the harness's
   cross-surface diff (§12) is the standing detector for whatever the
   lints miss.
5. **Fakes derive from contracts.** `fake-runtime.ts` executors and the
   Python fakes must be validated by the same Zod schemas and framing
   code as production — a fake that emits an invalid frame fails its own
   build. Delete the msgpack-no-length-prefix WS test helper divergence.

## 9. Fault injection points

Inject at the five real seams, controlled declaratively per journey
(`faults` block in `journey.json`), implemented once in the harness:

| Seam | Mechanism | Faults |
|---|---|---|
| Provider HTTP | fault-capable `CassetteProvider` | 429/500/timeouts, truncated stream after N chunks, malformed SSE, slow-drip tokens, mid-stream disconnect, cost-field omission |
| WS transport | proxy in front of `e2e-server` | drop (no FIN — the half-open case), delay, reorder within limits, fragment frames, stall reads (slow consumer → server buffer growth → drain-timeout path), abrupt close during `run_job` ack |
| Python bridge | fake worker + real-bridge harness | exit mid-request (pre- and post-startup), stderr flood, framing violation (bad length prefix), never-ready (spawn timeout), EPIPE on write, protocol-version mismatch |
| Process/host | harness-level | SIGKILL the server mid-run then restart (journeys 9/12 assert recovery/observability), disk-full via injectable storage adapter (asset write fails mid-run), DB locked/failed during job persistence (today silently swallowed at `unified-websocket-runner.ts:2868` — a journey must pin what the *intended* behavior is) |
| Client | driver-level | cancel at every event anchor, reconnect storms (connect/drop loops), duplicate commands, out-of-order `end_input_stream` |

Priority order for building: provider faults and WS faults first (they map
to the most recent incidents), bridge faults second, process/disk third.

Fault journeys assert the same §6 invariants — that is the point. A
dropped socket may fail the *client's* view of the run; it must never
orphan an actor, leak a slot, or corrupt the job table.

## 10. Invariants that must never be violated (system-wide)

The short list, worth printing:

1. A started run reaches exactly one terminal state, always, under every
   fault in §9. No run hangs forever; no run reports two terminals.
2. No orphaned execution: when the last consumer is gone (client, CLI,
   harness), the actors, bridge requests, and timers of that run are
   released within a bounded time.
3. Cancellation is total and prompt: cancel → all actors observe the
   signal, all inboxes close, `finalize()` runs, terminal `cancelled`
   emitted, within budget.
4. No silent data loss: pending inbox work after settle is an error, not
   a warning (behind the strict flag until burn-in, then default).
5. Every frame on every boundary is schema-valid; invalid frames are
   rejected at the boundary without corrupting the connection or the run.
6. Resource accounting returns to zero: job slots, sockets, child
   processes, file handles, pending promises.
7. Persisted job state and emitted terminal state never disagree.
8. The packaged artifact executes the same journeys with the same results
   as the dev tree.
9. One workflow, one params set, one cassette set → one normalized result,
   on every surface.

## 11. Release engineering

Restructure validation into three rings; a release is a promotion through
rings, not a tag plus hope:

**Ring 0 — PR gate (minutes).** Today's quality gate, plus: protocol
schema validation tests, the facade dependency lint, and the five
fastest journeys (1, 3, 6, 13, 14) on the kernel surface with strict
lifecycle mode. Hermetic, no network, no flake budget.

**Ring 1 — merge-to-main (tens of minutes).** Full journey suite on all
hermetic surfaces (kernel, WS server, e2e_runner browser, headless app,
CLI), full fault matrix, cross-surface differential diff, leak iterations,
plus the packaged-backend journey ring (bundle → stage → run journeys
against `server.mjs`). Runs before the Docker image is considered
deployable — i.e., it gates `fly-deploy.yml`, not just informs it.

**Ring 2 — release candidate (hours, per-OS).** Everything `release.yaml`
does today (packed-tree smoke boots on win/mac/linux, mcpb smoke, updater
assets), extended to run journeys 1/2/7 against the *packed* backend on
each OS — the ring that would have caught the sharp incident on the first
nightly instead of in a shipped build. Plus the real-provider nightly:
journeys 2/7/8 against live APIs with a spend cap (promoting
`example-smoke-debug.yml` from dispatch-only to scheduled), and the real
Python worker instead of the fake.

Two policy changes with more effect than any new job:

- **Journeys are required checks, not `continue-on-error`.** The
  `user-journeys.yml` comment already promises promotion "after a clean
  streak" — set the date. A reliability suite that can't fail the build
  is documentation.
- **Every incident retires into a journey or a fault.** The
  `backend:smoke` header comment is the model: the regression test *is*
  the incident writeup. `docs/KERNEL_PARITY_GAPS.md` shows the discipline
  already exists for parity; apply it to reliability.

## 12. The Reliability Harness architecture

```
reliability/
  journeys/<name>/...            # §4
  harness/
    core/
      journey.ts                 # manifest loader + Zod validation
      normalize.ts               # stream normalization (ids, ts, urls)
      diff.ts                    # per-channel stream diff  (grow from
                                 #   packages/cli/src/debug/diff.ts)
      invariants/                # one module per §6 invariant, each a
                                 #   pure function (RunRecord) -> Violation[]
      faults/                    # provider, ws-proxy, bridge, storage, client
      record.ts                  # RunRecord: every frame, both directions,
                                 #   timestamped, surface-tagged
    drivers/                     # ONE per surface, each ~"start, script,
      kernel.ts                  #   collect, teardown" against real entry pts
      ws-server.ts               #   (wraps e2e-server.ts + real msgpack client)
      cli.ts                     #   (spawns the real CLI binary)
      browser.ts                 #   (Playwright on e2e_runner — exists today)
      app-headless.ts            #   (wraps app-debug runtime)
      packaged.ts                #   (bundle-backend staging + server.mjs)
      electron.ts                #   (ring 2; drives packed app)
    compare.ts                   # cross-surface differential: run journey on
                                 #   N drivers, normalize, diff, report
    cli.ts                       # `nodetool reliability run <journey>
                                 #   [--surface ...] [--faults ...] [--diff]`
```

Design decisions:

- **Drivers speak entry points, never internals.** The kernel driver is
  the only one allowed to touch `ExecutionSession` directly (it *is* the
  reference surface). Every other driver goes through the same door a
  user does: the WS protocol, the CLI process, the browser page, the
  packed binary. That's what makes a green run meaningful.
- **The kernel surface is the oracle.** Differential comparison is
  every-surface-vs-kernel, not all-pairs — O(n) diffs, and disagreement
  assigns blame to a specific adapter layer.
- **`RunRecord` is the universal currency.** Every driver produces the
  same record shape (superset of the debug harness's bundle and the
  e2e_runner's `record.json`); invariants and diffs are pure functions
  over it, so they run identically in CI, in `nodetool reliability`, and
  over a record captured from a user's debug bundle — turning field
  incident bundles into replayable inputs.
- **Strict mode is a kernel flag, not a fork.** `runner.run({ strict })`
  turns the advisory checks (`_checkPendingInboxWork`, pending control
  responses, active-edge drain) into thrown violations. The harness
  always sets it; production gains it as a default once the suite is
  clean.
- **Reuse, don't rebuild.** `e2e-server.ts`, `fake-runtime.ts`,
  `cassette-provider.ts`, `debug/diff.ts`, the app-debug runtime, and
  `smoke-backend-bundle.mjs` are the harness's organs. The new code is
  the journey format, the invariant modules, the fault layer, the ws
  proxy, and the drivers' shared record shape.

### Build order

1. `ExecutionSession` facade; migrate CLI + debug + headless (the
   simplest three); dependency lint. *(unblocks everything; fixes the
   debug-harness abandonment leak immediately)*
2. Zod-first `messages.ts` + boundary validation + fake conformance.
   *(kills the protocol-drift class)*
3. Harness core + kernel and ws-server drivers + journeys 1–6 + strict
   mode → Ring 0.
4. Fault layer (provider, WS proxy) + journeys 8–10, 14; browser/CLI/app
   drivers + differential compare → Ring 1; gate deploys.
5. Bridge faults + real stdio fake + journey 7; packaged driver +
   journey 15 → Ring 2; migrate the WS runner onto the facade (last,
   because it's the richest surface).
6. Promote `user-journeys.yml` to required; retire incident backlog into
   journeys.

---

## What this buys

At millions of workflow executions, the failure modes that matter are
exactly the ones listed at the top: drift, boundary disagreement, timing,
environment. This design attacks each with structure — one facade so
drift has nowhere to live, executable schemas so boundaries can't
disagree silently, event-anchored fault journeys so timing bugs reproduce
on demand, and packaged-artifact rings so the thing tested is the thing
shipped. The unit tests stay what they are: fast proofs of local logic.
The harness is the proof of the system.
