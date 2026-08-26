# @nodetool-ai/execution

`ExecutionSession` — the one place that constructs `WorkflowRunner`. Sits
between `@nodetool-ai/kernel` and its consumers (CLI, debug harness, headless
job runner, HTTP API, MCP server, the WebSocket runner). See
[docs/RELIABILITY_ARCHITECTURE.md §7](../../docs/RELIABILITY_ARCHITECTURE.md#7-one-execution-implementation-across-surfaces-yes--and-its-closer-than-it-looks)
for the design rationale and
[docs/RELIABILITY_TASKS.md](../../docs/RELIABILITY_TASKS.md) (Track A) for the
task breakdown this package implements (A2). Task A3 migrated the CLI, debug
harness, and headless job runner onto this facade; A5 migrated the WS runner
(`unified-websocket-runner.ts`) last, once the reliability harness could watch
it for drift. The wiring-inventory table below is a historical snapshot from
before those migrations — each migrated row is annotated with what actually
changed; unmigrated sites (HTTP API, MCP server, the DSL, the agent runner,
`RunInnerGraph`, the browser workflow runner) are unchanged and still
construct `WorkflowRunner` directly, per `scripts/check-execution-boundary.mjs`'s
allowlist.

## Wiring inventory (Task A1)

Every non-test `new WorkflowRunner(...)` site in the repo, and what each one
does around `runner.run()`. "Decision" says where that behavior now lives:
**facade-owned** (moved into `ExecutionSession`, available to every surface
that migrates onto it), **adapter-owned** (stays specific to one surface —
transport/queueing/UI concerns the facade should not generalize), or
**out of scope** (a nested/child-runner construction, not a top-level
execution surface — not part of this facade's contract).

| Site | Graph hydration | Executor resolution | Param/stream seeding | Cancellation | Timeout | Persistence | Output-name rewriting | Decision |
|---|---|---|---|---|---|---|---|---|
| `packages/cli/src/nodetool.ts:751` (`workflows run`) | `hydrateGraphNodeFlags` (registry) | 3-branch: registry → `resolvePythonNodeExecutor` → throw (copy-pasted) | params only | none (`process.exit` on completion) | none | none (stdout only) | none | **facade-owned** (hydration, executor resolution); timeout/cancel are new capabilities A3 can adopt |
| `packages/cli/src/debug/server-runner.ts:101` (`nodetool debug`) | `hydrateGraphNodeFlags` (registry) | 3-branch (copy-pasted, identical to above) | params only | **none** — `withTimeout` races the promise and *abandons* the still-running kernel on timeout (a real leak, called out in RELIABILITY_ARCHITECTURE.md §7) | `withTimeout` wraps the whole run in a `setTimeout`/`Promise.race`, synthesizing a `failed` result; kernel run keeps executing | none | none | **facade-owned**: hydration, executor resolution, and — critically — the timeout becomes `session.cancel("timeout")` instead of abandonment (A3's stated fix) |
| `packages/websocket/src/headless-job-runner.ts:225` (`startHeadlessJob`) | `hydrateGraphNodeFlags` (registry), preceded by its own `normalizeRunnableGraph` (editor-only pruning, `data`→`properties`, edge_type normalization) | 3-branch (copy-pasted, identical) | params + optional `trigger_event` | none exposed (no cancel handle returned to caller) | none | `Job` row created before run, terminal status persisted after (`persistTerminalStatus`, DB-cancel-aware) | none | **facade-owned**: hydration + the `normalizeRunnableGraph` pre-step (folded into this package's `normalizeGraph`), executor resolution, trigger_event passthrough. Persistence stays **adapter-owned** (Job-model specifics) but is expressible via `JobPersistenceHook` |
| `packages/websocket/src/unified-websocket-runner.ts:2797` (`startJobInner`, `run_job`) | `this.hydrateGraph` — `Graph.loadFromDict({resolver: this.resolveNodeType})` when a node-type resolver is configured, else `withExplicitNodeFlags` (a *different* hydration path than `hydrateGraphNodeFlags`, richer: supports async Python-metadata-backed resolution) | `resolveExecutor` **injected at construction** (`UnifiedWebSocketRunnerOptions.resolveExecutor`) — not the copy-pasted 3-branch; the WS server wires it once at bootstrap | params, **plus** live `stream_input`/`end_input_stream` commands mapped straight onto `runner.pushInputValue`/`finishInputStream` (the *only* surface with streaming seeding before this package) | `cancelJob`: `runner.cancel()` + immediate DB `markCancelled()` + `job_update` (ahead of the runner's own `.finally()` persistence, to avoid a UI race) | none built in (host process only) | `Job.create` before run, queueing (`MAX_CONCURRENT_JOBS`, per-workflow caps), slot accounting (`startingJobs`→`activeJobs`) | **yes** — `unified-websocket-runner.ts:2733`: when `require_terminal_result`, every `nodetool.output.*` node's kernel-facing `name` is rewritten to `properties.name` before the run, so `output_update` and the terminal snapshot address the same key | **Migrated (A5).** `startJobInner` now calls `ExecutionSession.create(...)` instead of `new WorkflowRunner(...)` + a later `runner.run(...)`; `active.runner: WorkflowRunner` is `active.session: ExecutionSession`. What moved and what didn't: **hydration** stays exactly as it was — `this.hydrateGraph(rawGraph)` (unchanged, including the output-name rewrite right after it) still runs first, so `ExecutionSession` receives an *already-hydrated* graph; it re-hydrates internally via `withExplicitNodeFlags` (no `registry` passed — this class has never held a `NodeRegistry` instance, only the bootstrap-injected `resolveExecutor`/`resolveNodeType` closures), which is a no-op on fields already resolved (`...node` passes `propertyTypes`, flags, and the rewritten output name straight through). **Executor resolution** is the bootstrap-injected `this.resolveExecutor` passed via the facade's new `resolveExecutor` override (added in A5 specifically for this: it bypasses `ExecutionSession`'s own registry+bridge construction, since this class has no registry to hand it) — not rebuilt, not duplicated. **`pushInputValue`/`finishInputStream`** passthrough is now `session.pushInput`/`session.finishInputStream`; the new `session.updateNodeProperties` passthrough (added in A5) covers the `update_node_properties` command, which the pre-migration inventory above didn't list. **Still adapter-owned, unchanged**: queueing, slot accounting, per-client concurrency caps, the DB-ahead-of-runner cancel ordering, the `Job.create`/existing-row persistence block, output-name rewriting (still the manual pre-existing rewrite loop, not the facade's `requireTerminalResult` option — no reason to swap a working adapter-owned rewrite for a facade one mid-migration). One real (accepted) behavior shift: `ExecutionSession.create()` couples "construct" and "start the kernel run" into one call, where the pre-migration code constructed the runner (registering it in `activeJobs`, cancellable) *before* the `Job.create` persistence block and only called `runner.run()` *after* it — the migrated code creates the session (which starts the run) at the former construction point, so the run can begin a few milliseconds before its DB row exists. The reliability harness's differential suite (C2/C4) shows this produces no observable wire-protocol difference. |
| `packages/websocket/src/unified-websocket-runner.ts:4147` (`handleChatMessage`) | same `this.hydrateGraph` | injected `resolveExecutor` (same pattern) | params built from chat history/legacy fields | none exposed here directly (goes through the same `activeJobs`/`cancelJob` machinery) | none | `Job.create` (best-effort) | n/a | **out of scope for A2**: this is chat-turn orchestration built on the same runner-construction pattern as the row above, not a distinct wiring divergence |
| `packages/websocket/src/unified-websocket-runner.ts:6283` (single-node tool-call harness) | `this.hydrateGraph` on a synthetic one-node graph | injected `resolveExecutor` | `params: {}`, values fed via `data` on the synthetic node | none | none | none | n/a | **out of scope for A2**: an internal single-node execution helper (tool call → node run), not a top-level surface |
| `packages/websocket/src/http-api.ts:771` (async HTTP run) | — | — | params only | — | — | — | — | **Migrated.** The route calls `runWorkflow` from `@nodetool-ai/execution/service`, so hydration, executor resolution, cancellation, timeout and `Job` persistence are all the facade's now. The one thing it still owns is the environment: `environment: () => getWorkflowRuntimeEnvironment(options)`, passed lazily so a nonexistent workflow 404s before the runtime bootstraps. That bootstrap stays **out of scope** (it also builds the registry and connects the Python bridge — infra construction, not execution semantics) |
| `packages/websocket/src/mcp-server.ts` (MCP tool: run workflow) | — | — | — | — | — | — | — | **Gone.** The mount no longer runs workflows; `registerAgentMcpTools` exposes the agents package's capability tools instead, and the file imports nothing from `@nodetool-ai/kernel` |
| `packages/core-nodes/src/nodes/run-inner-graph.ts:131` (`RunInnerGraph` / `WorkflowNode`) | `Graph.loadFromDict` via `context.resolveNodeType` when set, else `withExplicitNodeFlags` | injected `resolveExecutor` from the *parent* run's `context.resolveExecutor` | params from node properties | none (bounded by the parent run's lifetime) | none | none (child of an already-persisted parent run) | maps runner output keys back to the sub-graph's declared output names (`outputKeyMap`) | **out of scope**: a node's own implementation spawning a *child* runner inside an already-running parent node — not a top-level surface entry point. Revisit only if a future task generalizes nested execution |
| `packages/agents/src/agent-workflow-runner.ts:127` (`AgentWorkflowRunner.execute`) | none — `applyRunPolicy` transforms an already-hydrated `GraphData`, no `hydrateGraphNodeFlags` call | `registry.resolve(node)` directly (no Python-bridge branch — agent graphs are TS-only) | params implicit in the resolved graph (agent nodes carry their own inputs) | none exposed | none | none | none | **out of scope**: agent-authored graphs execute through the planning agent's own runner, a different lifecycle (streams into a chat turn, not a job) than the eight external-entry surfaces this package targets |
| `packages/dsl/src/core.ts:399` (`run()`, the TS DSL entry point) | none — DSL nodes carry flags from generated metadata; wrapped in `withExplicitNodeFlags` directly | 4-branch: `opts.registry` → `NodeRegistry.global` → `builtinRegistry` → Python bridge → throw (a superset of the 3-branch pattern — DSL graphs can mix three TS registries) | params only | none | none | none | none | **out of scope for A2, revisit for A3+**: the DSL's multi-registry resolver is a genuinely different shape (3 TS registries, not 1) that this package's single-`registry` option doesn't yet cover. Noted as a gap, not silently generalized |
| `packages/workflow-runner/src/run.ts:118` (`runWorkflow`, browser + `nodetool run` shared core) | `hydrateGraphNodeFlags` | `opts.registry.resolve(node)` only (no Python-bridge branch — this path targets the browser, which has no Python bridge) | params only, **but** already an `AsyncGenerator<ProcessingMessage, RunResult>` with `AbortSignal`-based `cancelRun()` — this file is the closest existing prior art to `ExecutionSession`'s streaming/cancel shape | `AbortSignal` → `runner.cancel()`, mirrors this package's `cancel()` | none built in (caller's `AbortSignal` can carry one) | none (caller's concern) | none | **not migrated in A2** — its generator-based public API predates this package and has its own consumers (browser workflow runner, `nodetool run`). Cataloged here as the pattern this package's `messages`/`cancel()` API generalizes; a follow-up task can make it a thin wrapper over `ExecutionSession` |
| `packages/workflow-runner/e2e/src/browser-entry.ts:151` | same pattern as `run.ts` (it's the e2e harness's copy of the browser runner) | `opts.registry.resolve` | params only | `AbortSignal` | none | none | none | **out of scope**: test harness, not a product surface |

### Notes on what didn't make the table

- **The third executor-resolution copy is down to one caller.** `http-api.ts`
  and `mcp-server.ts` used to share a `getRuntimeEnvironment`/
  `getWorkflowRuntimeEnvironment` helper wrapping registry + Python-bridge
  bootstrap — a third copy of "registry → Python bridge → throw", independent
  of the one duplicated verbatim in `cli/nodetool.ts`, `debug/server-runner.ts`,
  and `headless-job-runner.ts`. `mcp-server.ts` no longer runs workflows, and
  `http-api.ts` now hands that helper to `runWorkflow` as an `environment`
  callback rather than driving a runner with it. Folding what remains onto this
  package's `createExecutorResolver` (`src/executor-resolver.ts`) is still open.
- **Output-name rewriting** existed at exactly one site
  (`unified-websocket-runner.ts:2733`, `require_terminal_result`). It is now
  `ExecutionSession`'s `requireTerminalResult` option
  (`src/output-names.ts`), available to every surface without being
  reinvented per-site.
- **`bufferLimit`** is a `WorkflowRunnerOptions` field, not a `run()`-time
  argument; no existing call site sets it (all rely on the kernel default).
  `ExecutionSession`'s `limits.bufferLimit` forwards it 1:1.
- **`nodeTimeoutMs`**, named in
  [RELIABILITY_ARCHITECTURE.md §7](../../docs/RELIABILITY_ARCHITECTURE.md),
  has no kernel-side hook today (only the run-level `AbortSignal` that
  `cancel()` aborts). `ExecutionSession.create()` throws if it's set, rather
  than accepting and silently ignoring it — inventing a no-op timeout would
  be worse than refusing it.

## API

```ts
import { ExecutionSession } from "@nodetool-ai/execution";

const session = await ExecutionSession.create({
  graph,                       // raw saved JSON — hydration happens HERE, once
  registry,                    // NodeRegistry from @nodetool-ai/node-sdk
  bridgeFactory,                // optional; defaults to connectPythonBridgeForGraph
  params,                       // and/or pushInput/finishInputStream below
  persistence: { onAccepted, onTerminal } | null,
  limits: { runTimeoutMs, bufferLimit },  // nodeTimeoutMs: not yet supported, see above
  requireTerminalResult: true,  // optional — output-name rewriting
  captureMessages: true,        // optional — required to read `messages` below
  catalogs, providerConfiguration,  // optional — preflight, see below
});

// Only with `captureMessages: true`, and only if you actually drain it:
// capture queues each message until a consumer pulls it, so a host that just
// awaits `result` would hold the whole run's messages (audio chunks included)
// for nothing. Reading `messages` without the flag throws; a consumer that
// falls behind `limits.messageBufferLimit` makes the iterator throw.
for await (const message of session.messages) { /* ProcessingMessage */ }

await session.pushInput("input_name", value);
session.finishInputStream("input_name");

session.cancel("reason");     // the ONLY cancel; limits.runTimeoutMs = cancel("timeout")

const result = await session.result;  // RunResult — never rejects
```

`create()` refuses before it spends anything. After normalization — and ahead
of the Python bridge, `persistence.onAccepted`, and the kernel — it checks the
graph's model selections against the provider catalogs and each selected
provider's credentials against `context.getSecret`, and throws
`ExecutionPreflightError` (`.issues` is the machine-readable list, `.message`
the text a host prints). Without it a missing key failed at the node that
needed it, after the upstream half of the graph had already run and billed.
`catalogs` and `providerConfiguration` default to the process-wide provider
registry; a host whose providers are not in that registry must pass both.

Inside the facade: `hydrateGraphNodeFlags` (plus the graph normalization
`headless-job-runner.ts` used to do inline — editor-only pruning, `data` →
`properties`, `edge_type` defaulting), the three-branch executor resolver,
param/stream seeding via the kernel's own `pushInputValue`/
`finishInputStream`, cancellation, and run-timeout-as-cancel.

## Subpaths

- `@nodetool-ai/execution/debug` — the execution-summary reducer, the run
  verdict, and the target/run-report types every surface reports a run with.
- `@nodetool-ai/execution/app-debug` — the headless mini-app simulator:
  `simulateApp` takes a resolved app target and an injected workflow runner and
  returns an `AppDebugReport`. It reads no database and writes no files, so the
  CLI (`nodetool app debug`), the agent build loop, and the server all simulate
  an app the same way. Target resolution and bundle writing belong to the host.

## What this package does not do

- **Does not validate the message stream against a schema.** `messages` is a
  live `AsyncIterable<ProcessingMessage>`; runtime protocol validation is
  Track B (`packages/protocol`'s Zod-first `messages.ts`).
