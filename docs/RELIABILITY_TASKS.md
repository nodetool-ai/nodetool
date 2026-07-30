# Reliability Architecture — Task Breakdown

Companion to [RELIABILITY_ARCHITECTURE.md](RELIABILITY_ARCHITECTURE.md).
The work is cut into six tracks that run **in parallel**; ordering
constraints exist only *inside* a track and at the few marked
cross-track joins. Each task is sized to be one PR, ownable by one
person or agent, with an explicit deliverable and a "done when".

Sizes: **S** ≤ 1 day, **M** 2–4 days, **L** ~1 week.

## Dependency graph

```mermaid
graph LR
  subgraph Track A — Execution facade
    A1 --> A2 --> A3
    A2 --> A4
  end
  subgraph Track B — Protocol validation
    B1 --> B2
    B1 --> B3
    B1 --> B4
  end
  subgraph Track C — Harness core
    C1 --> C2
    C1 --> C3
    C2 --> C4
    C3 --> C4
  end
  subgraph Track D — Fault layer
    D1
    D2
    D3
  end
  subgraph Track E — Contract tests & fakes
    E1
    E2
    E3
  end
  subgraph Track F — CI & release rings
    F1
    F2
  end
  A2 --> C2
  B1 --> C1
  B1 --> E1
  C4 --> D1
  C4 --> D2
  C4 --> F2
  E2 --> D3
```

Tracks A, B, E, F1 and C1 can all start **immediately**. The first join
is C2 (needs the facade from A2 and schemas from B1).

---

## Track A — `ExecutionSession` facade

Collapses the eight `WorkflowRunner` construction sites into one
package. Sequential within the track; parallel with everything else.

### A1 — Extract the shared wiring inventory (S)
Catalog exactly what each construction site does around `runner.run()`:
hydration (`hydrateGraphNodeFlags`), executor resolution (the
three-branch registry → Python bridge → throw resolver, copy-pasted in
`packages/cli/src/nodetool.ts`, `debug/server-runner.ts`,
`headless-job-runner.ts`), param vs. stream seeding, cancellation,
timeout, persistence, output-name rewriting
(`unified-websocket-runner.ts:2725`). Deliverable: a table in the
package README driving A2's API. Done when every divergence in
RELIABILITY_ARCHITECTURE.md §1 has a row and a decision (facade-owned /
adapter-owned / deleted).

### A2 — `@nodetool-ai/execution` package (L)
`ExecutionSession.create({graph, registry, bridgeFactory, params |
inputStream, persistence, limits})` with `messages` (AsyncIterable),
`pushInput`/`finishInputStream`, `cancel(reason)`, `result`. Hydration
and executor resolution live inside. Unit tests against the kernel.
Done when the package builds in dependency order and the API covers
every row A1 marked facade-owned.

### A3 — Migrate the three simple surfaces (M)
CLI `workflows run`, `nodetool debug` server surface, headless job
runner onto the facade. Fixes the debug-harness timeout that abandons a
still-running kernel (`server-runner.ts:113`) by replacing it with
`session.cancel("timeout")`. Done when the three call sites construct
no `WorkflowRunner` directly and existing CLI/debug tests pass.

### A4 — Dependency lint (S)
Extend the `deps` leg of `quality-checks.yml`: only
`@nodetool-ai/execution` (and the kernel's own tests) may import
`WorkflowRunner`. Done when a violating import fails CI. *(Can land
right after A2, before A3 — grandfather the unmigrated sites with an
explicit shrinking allowlist.)*

### A5 — Migrate the WS runner (L) — **last, after C4 exists**
The richest surface: map `run_job`/`stream_input`/`end_input_stream`/
`cancel_job` onto session calls, keep the drain/transform pipeline as
an adapter over `session.messages`. Done when the differential harness
(C4) shows no behavior change against the pre-migration recording.

## Track B — Runtime-validated protocol

Independent of Track A. B2/B3/B4 parallelize after B1.

### B1 — Zod-first `messages.ts` (L)
Rewrite `packages/protocol/src/messages.ts` as Zod schemas with types
via `z.infer`; export a discriminated-union `processingMessageSchema`
and per-type guards. Zero runtime behavior change — schemas only. Done
when typecheck passes repo-wide with no consumer edits (types must be
structurally identical) and a generated JSON Schema artifact is
emitted by the protocol build.

### B2 — Validate at the WS boundary (M)
`receiveMessage`/`receiveMessages` in `unified-websocket-runner.ts`
parse through the schemas instead of `typeof` narrowing; invalid frames
get a structured rejection without killing the connection. Outbound
validation behind an env flag (on in tests, off in prod until burn-in).
Done when the malformed-protocol journey inputs (journey 14 corpus) all
reject cleanly.

### B3 — Validate the Python bridge frames (M)
`python-bridge-base.ts` frame dispatcher validates `discover`/`result`/
`error`/`chunk`/`progress` payloads; ship the JSON Schema artifact to
the Python worker repo's test suite. Done when the fake workers (E2)
are schema-checked by construction.

### B4 — Validate client-side ingestion (S)
`GlobalWebSocketManager` (web) and `mobile/src/services/WebSocketService.ts`
parse inbound messages through the shared schemas in dev/test builds.
Done when both clients' test suites run with validation on.

## Track C — Harness core and drivers

### C1 — Journey format + `RunRecord` + normalization (M)
`reliability/harness/core/`: journey manifest loader (Zod, needs B1's
schema export), the `RunRecord` shape (superset of the debug bundle and
e2e_runner `record.json`), `normalize.ts`, and the per-node-channel
`diff.ts` grown from `packages/cli/src/debug/diff.ts`. Done when a
recorded debug bundle round-trips into a `RunRecord` and diffs against
itself empty.

### C2 — Kernel + WS-server drivers (M) — needs A2, C1
Kernel driver over `ExecutionSession` (the oracle surface); WS driver
wrapping `e2e-server.ts` with a real msgpack client. Done when journeys
1, 3, 6, 13 run green on both and cross-diff clean.

### C3 — Invariant modules (M) — needs C1 only; parallel with C2
One pure module per invariant family from §6 (lifecycle pairing,
terminal uniqueness, leak accounting, state-machine conformance,
protocol validity), each `(RunRecord) => Violation[]`, plus the kernel
`strict` flag that turns `_checkPendingInboxWork` and pending-control
warnings into errors. Done when each module has a fixture record that
fails it.

### C4 — Remaining drivers + differential compare + CLI (L) — needs C2, C3
CLI driver (spawns the real binary), browser driver (existing
e2e_runner Playwright), headless-app driver (app-debug runtime),
packaged driver (staged `server.mjs` via `smoke-backend-bundle.mjs`
mechanics), `compare.ts` (every-surface-vs-kernel), and
`nodetool reliability run <journey> [--surface] [--faults] [--diff]`.
Done when journey 1 runs on all five hermetic surfaces from one command
and the report names any diverging surface.

## Track D — Fault layer

Starts against C4's driver interface; D1–D3 are independent of each
other.

### D1 — Provider faults (M)
Fault-capable `CassetteProvider`: 429/500/timeout, truncated stream
after N chunks, malformed SSE, slow-drip, cost-field omission.
Journeys 8 and the provider half of 10. Done when journey 8 passes all
§6 invariants under every fault.

### D2 — WS proxy faults (L)
TCP/WS proxy in front of `e2e-server`: drop-without-FIN (half-open),
delay, stall reads (slow consumer → drain-timeout path), fragmenting,
abrupt close during `run_job` ack. Journeys 9 and 14. Done when the
client's declared state machine (`WebSocketManager.ts:95`) is asserted
under each fault.

### D3 — Bridge + host faults (M) — needs E2's stdio fake
Worker exit mid-request, framing violation, never-ready spawn, EPIPE,
version mismatch; SIGKILL-and-restart of the server; injectable storage
adapter for disk-full; DB-locked during job persistence (pins intended
behavior for the currently-swallowed failure at
`unified-websocket-runner.ts:2868`). Done when journey 7's fault matrix
runs in the PR ring.

## Track E — Contract tests and faithful fakes

Fully parallel with A/C/D; E1 needs B1.

### E1 — Provider contract suite from the registry (M)
One parameterized suite enumerating `provider-registry.ts`, asserting
the `BaseProvider` contract (streaming shape, error taxonomy, cost
fields, cancellation) against every registered provider via cassette.
Done when registering a provider with no cassette fails CI.

### E2 — Faithful Python stdio fake (M)
A stdio fake speaking the real length-prefixed msgpack framing
(closing the gap where only a differently-framed WS fake exists), plus
`python-stdio-bridge.test.ts` covering framing, spawn timeout, EPIPE,
and exit paths. Derive both fakes' framing from one shared module. Done
when the stdio bridge's crash paths have direct tests.

### E3 — Fake conformance gate (S)
`fake-runtime.ts` executors and both bridge fakes validate their
emissions through the B1 schemas at construction. Done when an
invalid-frame-emitting fake fails its own package tests.

## Track F — CI and release rings

### F1 — Ring promotion policy (S) — no code dependencies
Set the promotion date for `user-journeys.yml` from
`continue-on-error` to required (the workflow comment already promises
it "after a clean streak"); document the three-ring model and which of
the 38 workflows belong to which ring in
`.github/workflows/README.md`. Done when the ring table is merged and
the flake budget for Ring 0 is stated (zero).

### F2 — Wire the rings (M) — needs C4
Ring 0: journeys 1/3/6/13/14 (kernel surface, strict mode) in
`quality-checks.yml`. Ring 1: full hermetic suite + differential +
packaged journey gating `fly-deploy.yml`. Ring 2: extend `release.yaml`
per-OS packed-backend journeys and schedule the real-provider nightly
(promote `example-smoke-debug.yml` from dispatch-only, spend-capped).
Done when a seeded journey failure blocks a test deploy.

---

## Suggested parallel staffing

| Lane | Tasks, in order |
|---|---|
| 1 | A1 → A2 → A3 → A4 → (later) A5 |
| 2 | B1 → B2 → B4 |
| 3 | B3 (after B1) → E2 → E3 → D3 |
| 4 | C1 → C3 → C4 (join with lane 1's A2) |
| 5 | E1 (after B1) → D1 → D2 |
| 6 | F1 → C2 (after A2/C1) → F2 |

Six lanes, one join point mid-way (C2/C4 need A2), and A5 deliberately
last so the riskiest migration happens with the differential harness
already watching it.
