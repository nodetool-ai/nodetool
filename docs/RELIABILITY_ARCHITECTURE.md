# Reliability Architecture

One execution path, one protocol codec, and a cross-surface conformance harness
that validates releases with golden workflow journeys instead of isolated
package tests.

**Navigation**: [Architecture](architecture.md) | [Execution Strategies](execution-strategies.md) | [Kernel Parity Gaps](KERNEL_PARITY_GAPS.md) | [Development Standards](DEVELOPMENT_STANDARDS.md)

Status: proposal. Written as a plan of record for the next several years of
execution-layer work, not as a description of what exists today.

## 0. Thesis

The recent failures were not caused by missing tests. They were caused by
NodeTool having **more than one implementation of "run a workflow"**, each with
its own graph hydration, context construction, lifecycle, cancellation, error
mapping, and job-status persistence. Every new surface added another one.
Unit tests cover each copy in isolation and therefore cannot see the thing that
is actually broken: the divergence between the copies.

There are at least six live copies today:

| Site | Lines | What it re-implements |
|---|---|---|
| `packages/websocket/src/unified-websocket-runner.ts` | 7,709 | context, hydration, cancel, job status, asset autosave, error sanitization, chat/agent glue |
| `packages/websocket/src/headless-job-runner.ts` | 278 | context, hydration, job row, terminal status |
| `packages/workflow-runner/src/run.ts` | 225 | context, hydration, abort wiring |
| `packages/cli/src/nodetool.ts` (`workflows run`) | ~200 of 2k | context, hydration, secret resolution, output printing |
| `packages/cli/src/debug/server-runner.ts` | — | context, hydration, message capture, terminal status |
| `packages/websocket/src/http-api.ts`, `mcp-server.ts`, `agents/src/agent-workflow-runner.ts` | — | hydration + partial context |

`hydrateGraphNodeFlags` is called from **seven** non-test sites.
`new ProcessingContext` appears at **16** non-test sites. `new WorkflowRunner(`
appears **13** times across **11** non-test files, three of them inside
`unified-websocket-runner.ts` alone. One of the 13 is legitimate
(`core-nodes/src/nodes/run-inner-graph.ts` nests a runner by design); the rest
are surfaces each doing their own setup. Every one of those call sites is a
place where one surface can silently disagree with another about what a run
means.

The single biggest architectural investment is therefore **not** a test suite.
It is: **collapse all execution surfaces onto one supervised Run Host with a
single canonical event stream, then make cross-surface equivalence a
machine-checked property of every release.** The harness is the enforcement
mechanism, and it is worth nothing without the collapse. Building golden
journeys on top of six execution paths gives you six flaky suites and a false
sense of safety.

Do the collapse first. Build the harness second. Gate releases on it third.

---

## 1. Why unit tests miss this class of bug

Unit tests answer "does this function behave as its author imagined?" Every
failure listed in the brief is a question about something else.

**They test inside a single copy.** A test for `headless-job-runner.ts` asserts
that *it* persists `failed`. A test for the WebSocket runner asserts that *it*
persists `failed`. Neither test can fail when the two disagree about whether a
`GraphValidationError` is `failed` or `cancelled`. The bug lives in the delta,
and no test in the repo has both implementations in scope. This is the CLI vs
WebSocket divergence, exactly.

**The test double is the specification.** `packages/websocket/src/fake-runtime.ts`
re-registers every provider with `FakeProvider` and substitutes executors for
external nodes. It is well built and honest about what it does. But a fake is a
*second implementation of a contract*, written by the same person, at the same
moment, from the same misreading. When the fake Python worker accepts a message
shape the real `python -m nodetool.worker` rejects, both the fake and the test
are consistent, green, and wrong. A fake can only encode the parts of the
contract the author already understood. Bugs live in the parts they did not.

**Unit tests eliminate the dimensions where these bugs live.** They run:
- in one process, so process-crash and orphan-actor behavior is unreachable;
- with no real socket, so half-open TCP, reconnect, and backpressure are unreachable;
- from `src/` via the `development` export condition, so the packaged
  flat-`_modules/` layout that broke Electron is unreachable by construction;
- with a resolved module graph, so `import.meta.url`-relative asset resolution
  is unreachable;
- with an event loop that never applies real backpressure, so a slow consumer
  never forms.

The Electron packaging failures are the cleanest example. No amount of testing
`src/` can observe a bug whose entire cause is that the artifact resolves
modules differently than `src/` does. `npm run backend:smoke` exists precisely
because someone learned this. That instinct needs to be generalized, not
special-cased.

**Timing and scheduling are hidden.** Lifecycle races (hangs, leaks, orphaned
actors) are properties of *interleavings*. A unit test observes one interleaving,
usually the fastest and least interesting one. A test that passes 10,000 times
tells you almost nothing about the interleaving that occurs when a socket closes
between `run()` and the first `output_update`.

**Assertions are local; the failures are global.** "No actor outlives its run",
"every accepted job reaches a terminal status", "no Python worker is orphaned"
are statements about the whole system after the run. There is no function to
unit-test them on. They need a global observer.

**Coverage rewards the wrong thing.** With 58 packages and good per-package
coverage, adding tests raises confidence per package while total system
confidence stays flat, because the risk has migrated into the seams between
packages and between artifacts. Coverage cannot see a seam.

One correction to the premise worth stating plainly: `docs/KERNEL_PARITY_GAPS.md`
shows the team already understands drift and already writes tests that pin
current behavior so a change is explicit. That is the right instinct applied to
TS-vs-Python kernel parity. The proposal below is that same instinct applied to
surface-vs-surface parity, and mechanized so it does not depend on someone
remembering.

---

## 2. The highest-leverage investment

**One Run Host. One event stream. One protocol codec. Every surface is a thin
adapter. Cross-surface equivalence is asserted mechanically on every release.**

Concretely, four things, in this order:

1. **`packages/execution` — the Run Host.** The only code in the repo allowed to
   construct a `ProcessingContext`, hydrate a graph, construct a
   `WorkflowRunner`, own a run's lifecycle, or persist job status. Enforced by
   lint rule, not by convention.
2. **A canonical `RunEvent` stream.** One ordered, typed, serializable sequence
   of events per run, emitted by the Run Host. Every surface transports this
   stream and adds nothing. `ProcessingMessage` becomes the wire encoding of it,
   not a per-surface invention.
3. **One protocol codec per boundary, with a conformance suite the real
   implementation must pass.** WebSocket framing and the Python bridge each get
   a single encoder/decoder plus an executable contract that the *real* peer is
   run against in CI. Fakes are then generated from, or validated against, that
   contract. A fake that accepts what the real worker rejects becomes a failing
   test rather than a shipped bug.
4. **The Reliability Harness.** Runs one journey against every surface, records
   the canonical transcript from each, and diffs them. Plus fault injection and
   invariant checks over the same transcripts.

Why this and not the alternatives:

- *More integration tests on the current architecture* buys per-surface
  confidence and pays maintenance six times over, while the drift keeps
  regenerating. Testing does not remove a second implementation.
- *A formal protocol spec alone* (schemas, codegen) fixes shape drift but not
  lifecycle drift, which is where the hangs and leaks are.
- *Rewriting the kernel* is the wrong target. `packages/kernel` is the one part
  with a single implementation, dense tests, and a written parity-gap ledger.
  The kernel is not the problem. The six things wrapped around it are.

The reason to prefer collapse over coverage is arithmetic. With S surfaces and B
behaviors, testing each surface costs S×B assertions and admits S×(S−1)/2 drift
pairs. Collapsing to one implementation costs B assertions and admits zero drift
pairs, plus S cheap adapter-conformance checks. At S=7 that is roughly a 7×
reduction in what must be maintained and a categorical elimination of the bug
class, not a reduction in its probability.

---

## 3. Should NodeTool add golden workflow journeys through the production stack?

Yes, with three conditions that matter more than the journeys themselves.

**Condition 1: they run against build artifacts, not sources.** A journey that
imports `@nodetool-ai/kernel` through the `development` condition into `src/`
cannot catch the Electron packaging class of failure, which is a large share of
recent pain. Journeys must run against the GHCR image, the staged
`server.mjs` bundle, the packaged Electron app, and the published CLI binary.
Add source-mode runs as a fast pre-filter, but the gating run is on artifacts.

**Condition 2: they are contracts, not scripts.** A journey asserts a
*transcript* and a set of *invariants*, not screenshots and not incidental log
lines. Assertions must survive refactors that do not change behavior, or the
suite will be deleted within a year for flakiness.

**Condition 3: determinism is engineered, not hoped for.** LLM providers,
clocks, UUIDs, filesystem ordering, and concurrency are all nondeterministic.
Journeys need injected clock, RNG, and ID generation, plus recorded provider
transcripts, plus transcript normalization before diffing. Without this,
"golden" is a lie and the team learns to ignore red.

The existing `.github/workflows/user-journeys.yml` already has the right
sociology: nightly, `continue-on-error`, earn trust before gating. Keep that
policy. But its scope (drive the browser) is one surface. The proposal is to
make the journey *definition* surface-independent and run it across all of them.

What golden journeys are **not** for: replacing unit tests. Keep the kernel's
dense tests. Journeys are expensive, coarse, and slow to debug. Their job is
exactly the bugs unit tests structurally cannot see. Fifteen to twenty-five
journeys, forever, is the right order of magnitude. If the suite reaches 200,
someone has started using it for logic coverage and it will rot.

---

## 4. How journeys should be structured

A journey is **data**, not code. It declares intent; drivers execute it; the
harness judges it.

```ts
// packages/reliability/src/journeys/types.ts
export interface Journey {
  id: string;                       // "text-llm-linear"
  /** Surfaces this journey must pass on. Default: all. */
  surfaces: SurfaceId[];
  /** Graph source: shipped example slug, bundle file, or inline DSL. */
  target: JourneyTarget;
  params: Record<string, unknown>;
  /** Recorded provider interactions replayed byte-for-byte. */
  cassette?: string;
  /** Optional scripted interaction for app / chat surfaces. */
  script?: Interaction[];
  /** Faults to inject, by seam. Absent = clean run. */
  faults?: FaultPlan;
  /** What must be true of the transcript. */
  expect: Expectation[];
  /** Invariants beyond the always-on global set. */
  invariants?: InvariantId[];
  budget: { wallMs: number; peakRssMb?: number; maxEvents?: number };
}
```

Four properties make this work:

**Surface-independent by construction.** A journey never says "click Run" or
"send `run_job` over the socket". It says "start this graph with these params
and this interaction script". Each `SurfaceDriver` translates that into its own
idiom. If a journey cannot be expressed without naming a surface, it is a
surface test and belongs elsewhere.

**Asserted on a normalized transcript.** Every driver produces the same
`RunTranscript`:

```ts
export interface RunTranscript {
  events: NormalizedEvent[];   // canonical order, ids/timestamps normalized
  terminal: "completed" | "failed" | "cancelled" | "suspended";
  outputs: Record<string, unknown>;  // by output-node name
  errors: NormalizedError[];
  resources: ResourceSnapshot;       // handles, sockets, subprocesses, actors
  meta: { surface: SurfaceId; artifactId: string; durationMs: number };
}
```

Normalization is the load-bearing part: strip wall-clock timings, map job/node
run ids to stable ordinals, sort concurrent sibling events by a total order
derived from `(node_id, kind, sequence-within-node)`, and drop fields declared
transport-specific. What survives normalization *is* the behavioral contract.
Anything a surface is allowed to differ on must be normalized away explicitly,
in one reviewed file, so allowed differences are enumerated rather than
discovered.

**Three assertion tiers.** Journeys fail for different reasons and should say
which:
- *Tier A — outcome*: terminal status, output values, error taxonomy codes.
- *Tier B — sequence*: ordered event predicates ("`node_update:running` for
  `llm-1` precedes any `output_update`"), never full-transcript golden files.
  Full-file goldens on event streams generate weekly churn and get blanket-updated.
- *Tier C — cross-surface equality*: the normalized transcripts from N surfaces
  are equal, or differ only in explicitly allowed ways.

Tier C is where the real value is. It is also the only tier that cannot be
written as a per-surface test, which is why it does not exist today.

**Recorded provider interactions.** A `cassette` is a recorded request/response
transcript per provider, keyed by a hash of the normalized request. Modes:
`replay` (default, hermetic, offline), `record` (one run against real
providers, writes the cassette), `verify` (nightly; hit real providers and
assert the *shape* still matches, not the content). This is how provider
integration drift gets caught: `verify` fails when Anthropic changes a streaming
field, in a nightly job, before a user sees it. The current all-or-nothing
`FakeProvider` cannot do this, because it was never shaped by a real response.

Layout:

```
packages/reliability/
  src/
    journeys/            # journey definitions (data)
    drivers/             # one SurfaceDriver per surface
    transcript/          # normalize, diff, render
    invariants/          # executable invariant checkers
    faults/              # fault plans + seam implementations
    cassettes/           # recorded provider transcripts
    report/              # human + machine reports
  bin/reliability.ts     # nodetool-reliability CLI
```

---

## 5. Which journeys

Pick by *architectural surface exercised*, not by feature popularity. Each
journey must justify itself by the seam it covers. Suggested initial set of 18,
grouped:

**Core execution shape (5)**
1. `linear-pure` — three pure-compute nodes, no provider, no IO. The canary: if
   this differs across surfaces, everything downstream is meaningless.
2. `fanout-fanin` — parallel branches joined by a merge node. Covers scheduling
   order, correlation scope, and per-handle inbox counting.
3. `streaming-llm` — a streaming LLM node into an output node. Covers chunk
   ordering, partial output, token/cost accounting, and consecutive-dedup
   behavior noted as parity gap #9.
4. `loop-and-control` — a real loop plus a conditional branch. Covers control
   edges, `__control__` upstreams, and dynamic slots.
5. `subgraph` — `run-inner-graph` nesting. Covers nested runner lifecycle and
   nested cancellation, the most likely place to orphan an actor.

**Boundary crossings (5)**
6. `python-node` — one Python node through the real `python -m nodetool.worker`
   stdio bridge. Never faked in a gating run.
7. `code-runner-docker` — one code-runner node in Docker. Covers container
   lifecycle and cleanup on cancel.
8. `asset-roundtrip` — generate an image, autosave the asset, read it back
   downstream. Covers storage adapters and `<userId>/<assetId>` key layout on
   both local and S3/Supabase backends.
9. `large-payload` — a multi-megabyte media value crossing the WebSocket. Covers
   MsgPack framing, `getMaxWsMessageBytes`, chunking, and backpressure.
10. `provider-matrix` — the same prompt against Anthropic, OpenAI, Gemini, and
    Ollama in `verify` mode nightly, `replay` in CI. Covers provider drift.

**Lifecycle (4)**
11. `cancel-midflight` — cancel while a node is streaming. Asserts terminal
    `cancelled`, no post-cancel events, zero leaked resources.
12. `client-disappears` — kill the client transport mid-run without a cancel
    message. This is the half-open socket case. Asserts the run either
    completes headlessly or terminates, and in both cases persists a terminal
    status and leaks nothing.
13. `reconnect-resume` — disconnect, reconnect, re-attach to the running job.
    Asserts no duplicated and no dropped events across the gap.
14. `crash-and-restart` — SIGKILL the server mid-run, restart. Asserts no job is
    left `running` forever and no orphaned Python worker or container survives.

**Product-level (4)**
15. `mini-app-run` — an `ApplicationBundle` through `app-runtime`, including
    widget binding and variable folding. Runs on web, mobile, and
    `nodetool app debug`.
16. `chat-agent-tool-loop` — an agent turn with two `ui_*` tool calls, against a
    replayed provider.
17. `library-import-export` — export a `.nodetool` bundle, re-import it,
    re-run, assert the transcript equals the original's.
18. `trigger-dispatch` — a stored trigger event wakes a workflow headlessly.
    Covers the dispatcher and `headless-job-runner` path that no user-facing
    test touches today.

Every one of these must run on **every surface it is expressible on**. `linear-pure`
runs on all seven. `python-node` skips mobile. `mini-app-run` skips CLI-plain but
runs `app debug`. The skip list is declared in the journey, reviewed, and small.

---

## 6. Invariants to assert

Split into three classes by how they are checked.

### 6.1 Per-run invariants (from the transcript)

| ID | Invariant |
|---|---|
| `LIFECYCLE.terminal` | Every accepted run reaches exactly one terminal status. No run ends without one. |
| `LIFECYCLE.no-post-terminal` | No event carrying a run's id is emitted after its terminal event. |
| `LIFECYCLE.node-states` | Per node: `pending → running → (completed \| failed \| cancelled)`. No skipped or repeated transitions, no `completed` after `failed`. |
| `LIFECYCLE.started-implies-finished` | Every node that emitted `running` emits a terminal node event, including on run cancel. |
| `LIFECYCLE.edges-closed` | Every edge that went `active` reaches `completed` or `drained` (currently violated for input-originating edges: parity gap #15, so it is pinned as a known deviation with an expiry date, not silently skipped). |
| `CANCEL.prompt` | Cancel is observed within a bounded budget (default 2s) and produces no further node starts. |
| `CANCEL.idempotent` | N cancels produce one terminal transition. |
| `ERROR.taxonomy` | Every failure carries a stable machine code from a closed enum. No surface invents its own string. |
| `ERROR.no-secrets` | No event payload contains a value matching any secret in the run's environment, or an API-key-shaped token. |
| `DETERMINISM.replay` | Same journey, same cassette, same seeds → identical normalized transcript. Run twice per gating build. |
| `DETERMINISM.cross-surface` | Normalized transcripts are equal across surfaces, modulo the enumerated allowances. |
| `OUTPUT.completeness` | Every declared output node produced a value, or the run failed. A "completed" run with an empty output is a bug, not a result. |
| `PROTOCOL.decodable` | Every emitted frame decodes under the canonical codec and validates against its schema. Asserted on the wire, not on the object. |
| `PROTOCOL.ordering` | Per node, per output handle, the chunk sequence is gapless and monotonic. |
| `ACCOUNTING.usage` | Every `llm.chat`/`llm.stream` reports input/output tokens and a cost. Sum of node costs equals the run cost. |

### 6.2 Resource invariants (from probes, before/after)

| ID | Invariant |
|---|---|
| `RESOURCE.actors` | Zero live `NodeActor`s after terminal, on every path including crash-adjacent ones. |
| `RESOURCE.subprocesses` | Python worker and container count returns to baseline. No orphans, including after SIGKILL of the parent. |
| `RESOURCE.handles` | Open file descriptors and sockets return to baseline ±0 after a settling window. |
| `RESOURCE.timers` | No pending timers or intervals attributable to the run. |
| `RESOURCE.memory` | Peak RSS within the journey budget; RSS after 20 sequential runs of the same journey grows sub-linearly. This is the only cheap leak detector that actually works. |
| `RESOURCE.db` | No `Job` row left non-terminal after the process settles or restarts. |
| `RESOURCE.temp` | Workspace and temp directories cleaned, except artifacts the journey declares. |

### 6.3 System invariants (§10 expands these)

Never-violated properties that hold across runs, not within one.

The gating rule: **§6.1 and §6.2 are always on for every journey on every
surface.** A journey does not opt into them. Journeys only add expectations.
This is what makes invariants durable: nobody has to remember to check for a
leak.

---

## 7. Should all surfaces share one execution implementation?

Yes. Unambiguously, and this is the core recommendation. Not "share utilities" —
share the *implementation*, with surfaces reduced to transport.

Today, cross-surface behavior differs because behavior is *authored* per surface.
The proposal:

```
                       ┌────────────────────────────────────────┐
   surface adapters    │            packages/execution          │
   (transport only)    │                RunHost                 │
                       │                                        │
  ws-adapter ─────────▶│  1. resolve target  (id | bundle | dsl)│
  http-adapter ───────▶│  2. hydrate graph   (ONE impl)         │
  cli-adapter ────────▶│  3. build context   (ONE impl)         │
  electron-adapter ───▶│  4. validate        (validateGraph)    │
  mobile-adapter ─────▶│  5. supervise run   (WorkflowRunner)   │
  app-runtime ────────▶│  6. emit RunEvent[] (canonical)        │
  trigger-dispatch ───▶│  7. persist status  (ONE impl)         │
  mcp-adapter ────────▶│  8. release resources (ONE impl)       │
                       └────────────────────────────────────────┘
                                        │
                                        ▼
                                 packages/kernel
```

**The Run Host owns, exclusively:**

- target resolution (workflow id, JSON, bundle, DSL);
- graph hydration (`hydrateGraphNodeFlags`, editor-only stripping, bypass rewrite);
- `ProcessingContext` construction, including storage, cache, secrets, workspace;
- Python bridge attach/detach for the run;
- validation pre-flight;
- run supervision: start, cancel, timeout, suspend/resume;
- the canonical `RunEvent` stream;
- error normalization to the closed taxonomy;
- job-row creation and terminal-status persistence;
- teardown and resource release.

**A surface adapter may only:** authenticate, map an inbound request to a
`RunRequest`, subscribe to `RunEvent`s, encode them for its transport, and map
its transport's disconnect signal to the Run Host's `detach`/`cancel` API. An
adapter that contains a `switch` on node type, constructs a `ProcessingContext`,
or writes a `Job` row is a bug.

**API sketch:**

```ts
// packages/execution/src/run-host.ts
export interface RunHandle {
  readonly runId: string;
  events: AsyncIterable<RunEvent>;   // replayable from a cursor
  cancel(reason: CancelReason): Promise<void>;
  detach(): void;                    // client left; run policy decides
  updateNodeProperties(nodeId: string, props: Record<string, unknown>): void;
  status(): RunStatus;
}

export interface RunHost {
  start(req: RunRequest, env: RunEnv): Promise<RunHandle>;
  attach(runId: string, fromCursor?: number): Promise<RunHandle>;  // reconnect
  list(): RunStatus[];
  shutdown(reason: string): Promise<void>;                          // drains
}
```

Two design points that matter more than they look:

**`RunEnv` is the seam for determinism and fault injection.** It carries
`clock`, `random`, `idgen`, `storage`, `secrets`, `providerTransport`,
`pythonBridge`, and `faults`. Production passes the real one. The harness passes
a seeded, recorded, fault-injecting one. Because `RunEnv` is the *only* way the
Run Host touches the outside world, "inject a disk failure" becomes a
one-line change in a journey rather than a mock scattered through six files.
This is what makes fault injection cheap enough to actually use.

**`attach(runId, cursor)` moves reconnect into the Run Host, out of the
WebSocket layer.** The event stream is a durable, cursor-addressable
log for the run's lifetime. Reconnect becomes "resume from cursor N". Half-open
sockets stop being an execution problem and become a transport problem, which is
where they belong. `packages/kernel/src/durable-inbox.ts` shows the pattern is
already understood inside the kernel; lift it to the run boundary.

**The honest objection**: surfaces genuinely differ. The browser cannot spawn a
Python worker; mobile has no filesystem; a Fly deployment has no Docker socket.
The answer is *capabilities*, not forks. `RunEnv.capabilities` is a declared set;
the Run Host validates the graph against it during pre-flight and fails fast
with a specific error (`platform` validation already exists in
`workflow-runner/src/run.ts` and is the right idea generalized). A capability the
surface lacks produces a clean, uniform rejection, not a divergent code path.

---

## 8. Eliminating drift, mechanically

Written policy does not stop drift. Six mechanisms do:

**1. Import boundaries enforced by lint.** An ESLint rule (`no-restricted-imports`
with path groups, plus a custom rule) making `WorkflowRunner`, `ProcessingContext`,
`hydrateGraphNodeFlags`, and `Job` write methods importable *only* from
`packages/execution` and `packages/kernel`. This is a mechanical, unarguable
check that turns "another copy" from a code-review judgment call into a build
failure. It is also the single highest-value item in this whole document,
because it is cheap and permanent.

**2. Adapter conformance tests.** Each `SurfaceDriver` runs a tiny fixed suite
proving it is a pure transport: it forwards every event kind, preserves order,
propagates cancel within budget, and maps disconnect to `detach`. Twelve
assertions per surface, not a full journey.

**3. One codec per boundary, contract-tested against the real peer.**
`packages/protocol` already holds `messages.ts` and `bridge-protocol.ts`. Make
each an authoritative schema (Zod today, JSON Schema exported for the Python
side) and derive both encoder and decoder from it. Then:
   - a **wire conformance suite** of valid and invalid frames that both the TS
     codec and the Python worker must classify identically. Malformed frames must
     be rejected identically. This is what would have caught "fake workers
     accepted shapes real workers rejected";
   - **fakes validated against the schema at construction time**, so
     `fake-runtime.ts` cannot emit or accept a shape the real peer would reject.
     A fake that drifts fails its own test.

**4. Cross-surface transcript diffing in CI** (Tier C, §4). Drift becomes a red
diff naming the two surfaces and the first divergent event. This is the
regression net for everything the other mechanisms miss.

**5. An enumerated allowance file.** `transcript/allowances.ts` lists every
permitted cross-surface difference, each with a reason and an owner. Adding an
allowance is a reviewed diff. Today these differences exist but are invisible;
the goal is not zero differences but zero *unknown* differences.

**6. Delete the copies.** Mechanisms 1–5 prevent new drift. They do not remove
`unified-websocket-runner.ts`'s 7,709 lines. That file should end up around 800:
authentication, socket plumbing, MsgPack framing, and subscription management.
Everything else moves into `packages/execution` or into nodes. Plan it as a
sequence of behavior-preserving extractions, each one gated by the harness
proving the transcript did not change. The harness is what makes this refactor
safe, which is the other reason to build it before attempting the collapse.

Suggested order (each step ships independently):

| Phase | Work | Exit criterion |
|---|---|---|
| 0 | `RunTranscript` + normalizer + one driver (CLI). | A transcript can be recorded and diffed against itself. |
| 1 | `packages/execution` with `RunHost`, built by extracting from `headless-job-runner` (smallest copy). Route the trigger dispatcher and HTTP run through it. | Two surfaces, one implementation, identical transcripts. |
| 2 | Drivers for WebSocket, server, Electron packaged, mobile, app-runtime. 5 journeys. Nightly, non-gating. | Tier C green for 14 nights. |
| 3 | Move the WebSocket runner onto `RunHost`. Enable the import lint. | `unified-websocket-runner.ts` under 1,500 lines; lint on. |
| 4 | Protocol codec unification + real-worker contract suite. | Fakes validated by schema; Python contract suite green. |
| 5 | Fault injection; full 18-journey set; promote to release gate. | Release blocked by journeys, not by package tests alone. |

Phases 0–2 are the ones worth committing to now. Later phases will be reshaped
by what Tier C finds, and it will find things.

---

## 9. Where fault injection goes

Fault injection belongs at the `RunEnv` seams, never inside node or kernel code.
No `if (process.env.CHAOS)` anywhere in production paths. Each seam gets a
decorator that a `FaultPlan` activates.

| Fault | Seam | Injection | Required outcome |
|---|---|---|---|
| Network failure | `RunEnv.providerTransport` | fail at connect / mid-stream / on the last chunk | node fails with a `provider.network` code; retry policy applied once and visibly; run reaches a terminal status |
| Provider failure | same | HTTP 429, 500, 401, malformed JSON, truncated SSE, an empty tool-call block | mapped to distinct taxonomy codes; 429 backs off; 401 does not retry |
| Provider slowness | same | delay exceeding the node timeout | node times out; downstream is cancelled; no orphan request |
| Reconnect | `SurfaceDriver` transport | drop the socket at N random points, reconnect after 0/1/30s | `attach(cursor)` yields no duplicate and no dropped events |
| Half-open socket | transport | stop reading without FIN | server detects it within the heartbeat budget and `detach`es; the run does not wedge |
| Backpressure / slow consumer | transport | consumer reads at 1 KB/s while a node streams 50 MB | bounded server memory; either drop-with-notice or block-with-flow-control, one policy, identically on all surfaces; never unbounded buffering |
| Cancellation | `RunHandle.cancel` | at every lifecycle phase, including pre-start and post-terminal | §6.1 `CANCEL.*` hold at all phases |
| Process crash | supervisor | SIGKILL server / Electron main / Python worker at N phases | no orphan process; no permanently `running` job; restart reconciles |
| Worker failure | `RunEnv.pythonBridge` | exit mid-request, return a malformed msgpack frame, stall, refuse to spawn | mapped to `worker.*` codes; bridge reconnects for the next run; no leaked pipe |
| Disk failure | `RunEnv.storage` | ENOSPC, EACCES, slow fsync, partial write, read-back mismatch | write failures surface as node errors, never silent data loss; no partial asset registered in the DB |
| DB failure | `RunEnv.db` | SQLite lock contention, write failure at terminal-status persistence | terminal status retried or the run is marked reconcilable; never silently dropped |
| Malformed protocol | codec | fuzzed frames: truncated, wrong type tags, unknown message kinds, oversized, deeply nested | rejected with a specific code, connection stays usable or closes cleanly; never a crash, never partial application |
| Clock | `RunEnv.clock` | jumps forward and backward | no infinite waits; timeouts monotonic-based |
| Concurrency | scheduler hook | deterministic interleaving exploration under a seed | seed reproduces any failure exactly |

Two rules make this pay off:

**Every fault runs against every core journey**, driven by a seeded matrix, not
hand-written per-fault tests. Journey × fault × phase is a large space; sample
it (a fixed seed per night, plus a nightly random seed) instead of enumerating
it. A failing seed becomes a permanent regression case.

**Malformed-protocol fuzzing runs against the real Python worker**, not the
fake. That is precisely where the shipped bug was.

The concurrency-interleaving row is the highest-value and hardest item. A
deterministic scheduler hook in the kernel that a seed can drive (choose which
ready actor steps next) turns lifecycle races from "unreproducible" into "seed
4823". If only one item from this table gets built beyond the easy ones, build
that.

---

## 10. System invariants that must never be violated

Ten properties. Any violation is a release blocker, not a bug report. Each one
is stated so it can be mechanically checked.

1. **Terminal status is universal.** Every accepted run reaches exactly one of
   `completed | failed | cancelled | suspended`, is persisted, and is observable
   after a process restart. A job stuck in `running` is data corruption.
2. **No resource outlives its run.** Actors, subprocesses, containers, sockets,
   file handles, timers, and temp directories return to baseline after terminal
   plus a settling window, on every path including crash and cancel.
3. **Cancel is prompt, total, and idempotent.** Bounded latency, no work after
   it, N calls produce one transition.
4. **Behavior is surface-independent.** Identical `RunRequest` and `RunEnv`
   produce identical normalized transcripts on every surface, modulo the
   reviewed allowance list.
5. **The event stream is append-only, ordered, and gapless per node/handle.** No
   event after terminal. No reordering within a handle. A reconnect delivers each
   event exactly once.
6. **Only schema-valid frames cross a boundary.** Anything else is rejected with
   a specific code and never partially applied. This binds fakes as strictly as
   real peers.
7. **Errors are typed and contained.** Every failure carries a code from a
   closed taxonomy. One node's failure never takes down the process, and never
   silently degrades into a successful-looking run with missing output.
8. **Secrets never appear in an event, log, trace, error, or asset.** Checked by
   scanning every transcript for the run's own secret values.
9. **Determinism given a fixed environment.** Same graph, params, seeds, and
   cassettes → same transcript. Nondeterminism is a bug with a location, not a
   fact of life.
10. **The artifact behaves like the source.** The packaged Electron app, the GHCR
    image, and the published CLI produce transcripts identical to a source-mode
    run of the same journey.

Number 10 deserves emphasis. It is the invariant the repo has learned the hard
way twice (`PACKAGE_RUNTIME_ASSETS`, `backend:smoke`). Both fixes are correct and
both are narrow. Stating it as a global invariant, checked by running journeys
on artifacts, generalizes the lesson.

---

## 11. Release engineering

The current gate is "packages pass their tests". That gate is structurally blind
to every failure in the brief. Replace it with a tiered model where **the unit of
validation is an artifact running a journey**, not a package running a test.

**Tier 0 — pre-commit / PR, under 10 minutes.**
`typecheck`, `lint`, unit tests, `validate` on shipped examples, plus a new
**smoke journey set**: 3 journeys (`linear-pure`, `streaming-llm` replayed,
`cancel-midflight`) on 2 surfaces (CLI, WebSocket), source mode. Blocking. This
is the fast drift detector, and it must stay under 10 minutes or it will be
bypassed.

**Tier 1 — merge to main, under 45 minutes.**
Build all artifacts. Run the full 18 journeys on all surfaces in source mode,
plus the smoke set on the *built* server bundle and the GHCR image. Tier C
diffing on. Blocking for main. A red Tier 1 reverts the merge; it does not open a
ticket.

**Tier 2 — nightly, unbounded.**
Full journey × surface matrix on packaged artifacts for all three OSes. Fault
matrix under the night's seed. Provider cassettes in `verify` mode against real
APIs. Twenty-run leak soak. Non-blocking at first (the existing
`user-journeys.yml` policy), promoted per journey as each earns a 14-night clean
streak. Per-journey promotion, not all-or-nothing, so one flaky journey does not
discredit the suite.

**Tier 3 — release candidate, blocking, no exceptions.**
A release is a *candidate* until it passes:
- full journeys on every packaged artifact for macOS, Windows, and Linux;
- the fault matrix at the release seed;
- `LIFECYCLE.*` and `RESOURCE.*` invariants green on every journey;
- Tier C cross-surface equality green, with no allowance added since the last
  release that is not signed off;
- the leak soak within budget;
- a **transcript diff against the previous release**, reviewed. Not "green vs
  red" but "what changed in observable behavior since the last version". This
  turns the release notes for the execution layer into a generated artifact and
  makes unintended behavior changes visible before shipping instead of after.

That last item is the biggest cultural change. Today nobody can answer "did
behavior change?" except by reading diffs and hoping. A release-to-release
transcript diff answers it mechanically.

**Supporting changes:**

- **One artifact promoted, never rebuilt.** The GHCR image validated in Tier 3 is
  the image deployed to Fly. `fly-deploy.yml` should deploy by digest, not
  rebuild. A rebuilt artifact is an unvalidated artifact.
- **Reliability budget instead of coverage targets.** Track journey pass rate per
  surface, mean cancel latency, leak-check margin, and allowance count as
  release metrics. Coverage percentage should stop being a release signal; it has
  been high throughout every failure described here.
- **Every production incident becomes a journey or a fault, in the same PR as
  the fix.** Not a unit test. A unit test for a drift bug pins one copy's
  behavior and leaves the drift.
- **Allowance count is a tracked, ratcheting number.** It may only go down
  without explicit sign-off.

---

## 12. The Reliability Harness

### 12.1 Shape

```
┌──────────────────────────────────────────────────────────────────┐
│                          Orchestrator                            │
│  journeys × surfaces × faults × seeds → a plan; runs it; judges  │
└───────────┬──────────────────────────────────────────────┬───────┘
            │                                              │
            ▼                                              ▼
   ┌───────────────────┐                        ┌──────────────────────┐
   │  SurfaceDriver[]  │                        │  Judge               │
   │                   │                        │  · expectations      │
   │  cli-source       │──▶ RunTranscript ──────▶│  · invariants (all) │
   │  cli-packaged     │                        │  · Tier C diff       │
   │  websocket        │                        │  · budgets           │
   │  http-server      │                        └──────────┬───────────┘
   │  ghcr-image       │                                   │
   │  electron-packaged│                                   ▼
   │  mobile-rn        │                        ┌──────────────────────┐
   │  app-runtime      │                        │ Report               │
   │  mcp              │                        │ report.json / .md    │
   └─────────┬─────────┘                        │ transcripts/         │
             │                                  │ diffs/ · seeds       │
             ▼                                  └──────────────────────┘
   ┌───────────────────────────────────────┐
   │ Environment layer (per driver)        │
   │  RunEnv: clock, rng, idgen,           │
   │  storage, secrets, providerTransport, │
   │  pythonBridge, faults, capabilities   │
   │  + ResourceProbe (handles, procs, rss)│
   └───────────────────────────────────────┘
```

### 12.2 The driver contract

The whole design rests on one interface. If it stays this small, surfaces stay
comparable; if it grows per-surface options, the harness has become six suites
again.

```ts
// packages/reliability/src/drivers/types.ts
export interface SurfaceDriver {
  readonly id: SurfaceId;
  readonly capabilities: Capabilities;

  /** Bring the surface up (spawn server, launch Electron, boot Metro…). */
  setup(env: HarnessEnv): Promise<void>;

  /** Execute one journey. MUST NOT interpret `expect` or `invariants`. */
  run(journey: Journey): Promise<RawTranscript>;

  /** Probe resources for RESOURCE.* invariants. */
  probe(): Promise<ResourceSnapshot>;

  /** Faults the surface can inject; the orchestrator skips the rest. */
  supportedFaults(): FaultId[];

  teardown(): Promise<void>;
}
```

A driver's only job is *translation*. It must not assert. Keeping judgment
entirely in the `Judge` is what guarantees all surfaces are held to the same
standard, and it is the rule most likely to be violated under deadline pressure.

Drivers map onto existing assets rather than starting from nothing:
`cli-source` wraps `nodetool debug` (`packages/cli/src/debug/`); `websocket`
wraps `packages/cli/src/websocket-client.ts`; `app-runtime` wraps
`packages/cli/src/app-debug/`; `electron-packaged` and `mobile-rn` extend the
existing Playwright and Detox setups. The `e2e-runner` and `screenshot-server`
harnesses in `web/tests/` already do most of what the browser driver needs.

### 12.3 Judging

```ts
const transcripts = await Promise.all(
  surfaces.map(d => d.run(journey).then(normalize))
);

const verdict = judge({
  journey,
  transcripts,
  checks: [
    ...ALWAYS_ON_INVARIANTS,      // §6.1 + §6.2, not opt-in
    ...journey.invariants.map(byId),
    ...journey.expect.map(toCheck),
    crossSurfaceEquality(ALLOWANCES)   // Tier C
  ]
});
```

Failure output must name the seam, or engineers will not use it:

```
FAIL  journey=cancel-midflight  surfaces=[websocket, cli-packaged]
  Tier C: transcripts diverge at event #41
    websocket    : node_update{node=llm-1, status=cancelled}
    cli-packaged : node_update{node=llm-1, status=failed, code=provider.aborted}
  → cancel is mapped to a node failure on the CLI path.
    websocket:   packages/websocket/src/unified-websocket-runner.ts:5210
    cli:         packages/cli/src/nodetool.ts:812
  repro: nodetool-reliability run cancel-midflight \
           --surfaces websocket,cli-packaged --seed 4823
```

Every failure reports a single-command repro with the seed. A harness whose
failures cannot be reproduced locally in one command will be ignored, no matter
how correct it is.

### 12.4 Determinism mechanics

Five sources of nondeterminism, five answers, all in `RunEnv`:

| Source | Answer |
|---|---|
| Time | injected `clock`; monotonic for timeouts; normalized out of transcripts |
| IDs | seeded `idgen`; normalized to ordinals |
| Randomness | seeded `random` |
| Providers | cassettes: `replay` in CI, `verify` nightly, `record` on demand |
| Concurrency | seeded scheduler hook; concurrent siblings sorted by a declared total order before diffing |

Any test that needs `sleep` to pass is a bug in the harness, not a flaky test.
Waiting is expressed as "wait for event E or fail after budget", never as a
duration.

### 12.5 Cost control

The harness will be the most expensive thing in CI if built carelessly.

- Cassette replay by default; real providers only in nightly `verify`.
- Artifacts built once per commit, reused by every driver.
- Journeys sharded across runners; the matrix is embarrassingly parallel.
- Tier 0 is a hard 10-minute budget; if it exceeds that, journeys move to Tier 1
  rather than the budget being raised.
- Faults sampled per seed, never fully enumerated.

### 12.6 Reuse beyond CI

The harness is worth building only if it is also the local development tool. Same
binary, same journeys:

```bash
nodetool-reliability run linear-pure --surfaces all
nodetool-reliability diff streaming-llm --surfaces websocket,cli
nodetool-reliability record provider-matrix --provider anthropic
nodetool-reliability soak cancel-midflight --runs 200 --seed random
nodetool-reliability baseline --against v0.9.4   # release transcript diff
```

`nodetool debug` and `nodetool app debug` already established that agent-readable
run reports are the right interface for this codebase. The harness should extend
that shape rather than invent a new one, and its `report.json` should be the same
kind of artifact an agent can read, diff, and act on.

---

## 13. What not to do

Stated explicitly, because each is a plausible-sounding alternative that would
consume the budget without removing the bug class.

- **Do not write per-surface integration suites.** That is the current
  architecture with more tests, and it institutionalizes the drift.
- **Do not chase coverage.** Coverage was high during every failure listed.
- **Do not golden-file whole event streams.** They churn, get blanket-updated,
  and stop being read. Assert ordered predicates plus cross-surface equality.
- **Do not rewrite the kernel.** It is the healthiest layer in the system.
- **Do not add faults inside production code paths.** Faults belong at `RunEnv`
  seams. A `CHAOS` flag in a node is a permanent liability.
- **Do not gate on the harness before it is stable.** Nightly and
  non-blocking, per-journey promotion after a clean streak, exactly the policy
  `user-journeys.yml` already uses.
- **Do not let drivers assert.** The moment a driver contains an expectation,
  surfaces stop being comparable and Tier C is dead.

## 14. If only three things get built

In priority order, and each is independently valuable:

1. **The import lint plus `packages/execution`.** Stops new drift permanently and
   gives every future surface one path to follow. Cheapest, most durable.
2. **`RunTranscript` normalization plus Tier C diffing on two surfaces.** Makes
   existing drift visible for the first time. Almost certainly finds real bugs in
   week one.
3. **The real-peer protocol contract suite for the Python bridge and the
   WebSocket codec.** Directly kills the "fake accepted what the real worker
   rejected" class, and makes every existing fake trustworthy.

Everything else in this document amplifies these three.

## Related

- [Architecture](architecture.md) — system overview
- [Execution Strategies](execution-strategies.md) — the actor-model kernel
- [Kernel Parity Gaps](KERNEL_PARITY_GAPS.md) — the existing drift ledger this generalizes
- [Development Standards](DEVELOPMENT_STANDARDS.md) — testing, observability, error handling
- [Correlation Design](correlation-design.md) — the lineage model the scheduler relies on
