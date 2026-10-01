# Workflow execution lifecycle

## Construction inventory before convergence

This inventory comes from repository-wide searches for `new WorkflowRunner`,
`WorkflowRunner(`, `connectPythonBridgeForGraph`, `hydrateGraphNodeFlags`, and
`withExplicitNodeFlags`. Paths identify call sites without depending on line
numbers. Tests under `tests/` and `__tests__/` construct the kernel directly.

| Construction site | Classification | Responsibilities before migration |
| --- | --- | --- |
| `packages/execution/src/session.ts` | Top-level server execution | Normalize, hydrate, preflight, resolve executors, construct context and runner, connect and close Python, timeout, cancel, live input and properties, message capture, cost ledger, worker boundaries, optional output naming and persistence, scratch cleanup |
| `packages/execution/src/service/workflow-run.ts` | Top-level server execution | Normalize, metadata hydration, preflight, registry or host resolver, start shared Python worker, workspace context, runner, interactive cancel, progress and terminal persistence, output naming, result presentation. No run timeout or scratch cleanup |
| `packages/dsl/src/core.ts` | Top-level server execution | Build graph with explicit flags, construct context, caller/global/builtin/Python resolution, connect and close Python, runner, throw on failed result or node error, select last output. No preflight, timeout, persistence, live inputs or property updates |
| `scripts/run-workflow.mjs` | Top-level server execution | Load file, prepare registry and context, select providers, start local Python worker, resolve executors, runner, print result, close Python on success. No cancellation, timeout or workspace cleanup |
| `packages/workflow-runner/src/run.ts` | Browser/portable execution | Registry hydration and validation, context and runner, AbortSignal cancellation, queue/wake message streaming, completion and result propagation, listener cleanup. No Python, persistence or output rewriting |
| `packages/workflow-runner/e2e/src/browser-entry.ts` | Specialized browser harness | Prepare context, registry and sandbox catalog, hydrate graph, runner, record messages and traces, browser test controls. No server lifecycle |
| `packages/core-nodes/src/nodes/run-inner-graph.ts` | Nested execution | Normalize child graph, inherited metadata and executor resolution, inherited context, runner, failure interpretation and parent output mapping. No independent Python, persistence, timeout or workspace cleanup |
| `examples/workflow_runner/js/main.js` | Browser execution, different class | Constructs the example's HTTP/WebSocket client named `WorkflowRunner`, not the kernel runner. Owns transport and UI |

Electron's `createWorkflowRunner()` constructs a client store, not the kernel
runner. README examples are documentation rather than execution entry points.

## Boundary

Top-level Node/server execution uses `ExecutionSession`. Public APIs keep their
own graph preparation and result presentation. Nested execution can construct a
child kernel runner with its inherited environment. Browser execution uses the
portable `runWorkflow` API. Kernel tests and browser harnesses can construct the
runner directly. `npm run check:execution-boundary` guards production sources.

## Session responsibility audit

| Behavior | Ownership |
| --- | --- |
| Normalize, hydrate, construct runner, cancel, timeout, terminal result | Canonical lifecycle |
| Python connection, worker job boundaries and owned bridge close | Canonical lifecycle. A shared host bridge remains host-owned |
| Scratch cleanup, including setup failure | Canonical lifecycle |
| `buildWorkspaceExecutionContext` | Server default. An injected context overrides secrets, storage, workspace and generation durability |
| Headless permission gate | Server default, explicitly disabled by hosts preserving another permission policy |
| Cost ledger | Optional integration, enabled by default for existing server callers |
| Durable generation tracking | Context preparation, enabled by the default server context and saved-workflow service. Injected contexts choose their own hooks |
| Output name rewriting | Optional presentation policy, enabled with `requireTerminalResult` |
| Persistence | Optional host hooks. Job rows, progress, interactive sessions and receipt formatting remain in adapters |
| Buffered message iteration | Portable coordination shared with the browser runner |

The DSL keeps its explicit graph flags and output keys, secret resolver and
registry precedence. Its preflight and cost recording remain disabled. Its
result adapter continues throwing on failed runs and node error messages.

Shared-server bridge bootstrap and metadata preparation remain host work.
WebSocket graph preparation still precedes session normalization and hydration.
Nested execution retains its parent context and output mapping.

## Adapter changes

DSL `run()` and `runGraph()` retain their signatures and return records of the
last value for each nonempty output. Registry resolution stays caller registry,
global registry, builtin packs, then Python. The DSL no longer connects or closes
Python, constructs a runner, or invokes the kernel run method. Graph conversion,
context inputs, registry policy and result-to-exception conversion stay in the
adapter.

The saved-workflow service and `scripts/run-workflow.mjs` also use the session.
The file runner keeps its existing preflight, permission and cost-recording
policies through explicit options rather than inheriting server defaults.
The service retains ownership checks, preflight before lazy bootstrap, metadata
preparation, job progress, background receipts and interactive verdicts. Its
shared Python bridge now receives session job boundaries without being closed.

Actor failures now produce a canonical failed run. The legacy DSL check for
node error messages remains separate from the session and is tested against a
message-only result. A cancellation can also retain node errors while reporting
a cancelled terminal status.

The session adds these options for known host requirements:

| Option | Requirement |
| --- | --- |
| `executorResolverFactory` | DSL registry precedence needs the bridge the session owns |
| `hasTsExecutor` | Python detection must consult every DSL TS registry |
| `bridgeOptions` | Preserve DSL remote worker configuration without wrapping bridge lifecycle |
| `preflight` | Preserve DSL behavior and avoid repeating the service's pre-bootstrap preflight |
| `installHeadlessPermissionGate` | Preserve an injected DSL context's permission policy |

`context` and `recordCosts` already existed. The DSL uses them to preserve its
secret resolver and avoid adding persistence.

## Behavior verification

The DSL differential tests retain the previous kernel path as a test oracle.
They compare outputs, status, errors and retained messages for independent
outputs, actor failure and an empty terminal. Job IDs and durations are excluded
from comparison. Registry tests cover caller precedence, global precedence over
builtin packs, builtin fallback and Python fallback with required secrets.
Python tests stub the transport rather than starting a worker.

Lifecycle tests cover bridge closure on completion, failure and partial setup,
workspace cleanup on setup failure and execution errors, explicit cancellation
and timeout. The cleanup test fails against the previous session when hydration
throws after connecting the bridge. Existing runtime tests cover closure after
local or remote bridge connection failures.

Portable tests cover ordered delivery, terminal delivery after abort, queue
draining, listener cleanup and abort before start. The cancellation terminal test
fails against the previous portable runner. Message-buffer tests drain a large
backlog and exercise overflow. Architecture tests exercise renamed and namespace
imports while ignoring comments and types.

No output, status, retained-message or exception differences were found in the
representative DSL comparisons. Observable lifecycle changes are scratch cleanup
after setup failure, shared-worker job boundaries in service runs, and portable
terminal delivery after cancellation. Early portable iterator closure now
cancels and waits for the run instead of leaving it executing without a consumer.

## Remaining duplication

The saved-workflow service and WebSocket host still prepare metadata before the
session hydrates the graph. Moving that preparation requires preserving unknown
nodes, list property types and each surface's output keys. Server preflight is
also performed before lazy service bootstrap, using the shared preflight helper.
Shared bridge bootstrap remains a host responsibility because its lifetime spans
runs. Nested graph normalization and output mapping remain local to the child
execution contract.
