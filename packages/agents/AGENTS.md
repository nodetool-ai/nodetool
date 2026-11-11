# Agents Package

**Navigation**: [Root AGENTS.md](../../AGENTS.md) → [TypeScript Backend](../AGENTS.md) → **Agents**

`@nodetool-ai/agents` holds the planner, the CodeAct step loop, the capability
registry, the QuickJS sandbox host and the eval suites. This file lists the
rules that apply to every change here. Implementation notes for each area live
in [`docs/`](docs/). Read the page for the area you touch before editing it,
and update that page in the same change.

For the architecture overview, see [Agent Architecture & Tools](../../docs/AGENTS.md).

## Commands

```bash
npm run test --workspace=packages/agents           # Vitest suite
npm run capabilities:check                         # capability coverage table is current
npm run capabilities:sync                          # rewrite the table from the live registry
npm run backend:smoke                              # bundled backend boots (catches init cycles)
npm run bench:sandbox --workspace=packages/agents  # guest/host boundary benchmark
npm run dev:nodetool -- eval <suite> --list        # list the cases of an eval suite
```

## Where to Read

| Changing | Read |
|---|---|
| `context.memory`, `list_shared` / `read_shared` / `share_result`, prompt preambles | [Shared memory](docs/shared-memory.md) |
| `src/js-sandbox.ts`, the worker, host modules, WASM modules, media handles, sandbox limits | [JavaScript sandbox](docs/js-sandbox.md), [descriptor leak](docs/quickjs-descriptor-leak.md) |
| `src/capabilities/`, capability coverage, `src/tools/mcp-tools.ts`, external MCP servers | [Capabilities and tool sources](docs/capabilities.md) |
| Script voicing, storyboard rendering, media analysis, timeline frame preview, Google Workspace tools | [Headless tool surfaces](docs/tool-surfaces.md) |
| Permission modes, approval round trips, which host gates what | [Permission gate](docs/permission-gate.md) |
| `TaskPlanner`, `ParallelTaskExecutor`, `RunBudget`, `create_plan` / `execute_plan`, `src/subagent.ts` | [Planning, execution and sub-agents](docs/planning-and-execution.md) |
| `src/codeact/`, the action contract, `createChatCodeActSession` | [CodeAct execution](docs/codeact.md) |
| `src/author-graph.ts`, `src/graph-dsl.ts` | [Graph authoring](docs/graph-authoring.md) |
| `src/evals/`, adding or running an eval suite | [Eval suites](docs/evals.md) |
| Execution tree, message types, debug logging, OpenTelemetry | [Observability](docs/observability.md) |
| Cost tracking, model selection, truncation and compaction, plan and schema validation, skills | [Tuning](docs/tuning.md) |
| `nodetool-chat`, `nodetool agent run` | [CLI](docs/cli.md) |

## Rules

### Memory and prompts

- `context.memory` is the only store shared between steps, tasks, sub-agents
  and tools. Do not add a parallel result map to an executor.
- Memory is not injected into prompts. Agents read it through `list_shared` and
  `read_shared`. `share_result` writes only the `shared:` namespace. Executors
  write `step:`, `task:` and `input:` keys through `context.memory.set`.
- A caller-supplied `systemPrompt` is a preamble placed before the default
  execution or planner contract. It never replaces the contract.
- There is no synthesis stage. `execute_plan` returns task results, and the
  calling loop writes the answer on its next turn. Do not add an aggregation
  task to a plan.

### Capabilities and permissions

- A capability is a spec, an implementation and a `CapabilityRun`. Per-run
  state arrives at call time, never at construction.
- Permission checks and argument validation live in `capabilities/invoke.ts`.
  Native capabilities must not pass through `capabilityFromTool`.
- `capabilities/` imports `tools/tool-permissions.ts`, never the reverse. The
  reverse edge deadlocks the bundled backend on a top-level await. Vitest does
  not catch it. `npm run backend:smoke` does.
- A new capability needs an eval case or a test suite. A changed description,
  input schema, category or `needsToolCallId` needs its coverage mapping
  updated. `npm run capabilities:check` and `harness gate` enforce both.
- The workflow, node, job and asset tools call NodeTool code in process. Do
  not route them through HTTP.
- There is one permission ladder and no separate plan-approval callback.
  `execute_plan` is approved as an `external` action. A headless host with
  nobody to ask denies the call and names itself in the message.

### Execution

- CodeAct is the only action space. Do not add a planning or script mode
  beside it.
- A step with an output schema finishes only through `finish()` (or
  `finish_step` in tool mode). There is no JSON-from-text fallback.
- A step action has no guest `fetch` and no secret scope. Network and secrets
  are reached through gated capabilities.
- A run has one `RunBudget`, created by the host and passed down unchanged.
  Do not construct a second one in an executor or a sub-agent.
- A budget stop yields a `ProviderStop` that every consumer surfaces. A step
  failure is terminal and is never reported as completion.
- Build a chat or CLI session with `createChatCodeActSession`. Spawn a child
  agent with `runSubAgent`. Do not assemble an executor by hand.

### Sandbox

- Libraries reach guest code as imports of sandbox packages, never as globals.
  Dynamic `import()` and `require` do not resolve.
- Host bridge functions never reject. They return a tagged error that the
  guest prelude rethrows. Bridge results are plain data, because a function
  cannot cross `postMessage`.
- Host-to-guest bytes travel as a base64 marker object that the prelude
  rebuilds into a `Uint8Array`. Follow that pattern for a new binary bridge.
- Media transforms take and return handles (`sandbox://media/<id>`), not
  bytes. `media.toImage(handle)` is the only call that writes an asset.
- Safety limits live inside the host-module implementations. The dispatcher
  validates module id, export name and arguments before it loads anything.
- Dispose every `Lifetime` taken from the QuickJS engine. Do not add
  caller-specific fresh-engine options. Both the in-process and the worker
  path keep their cached engines.
- Filesystem-containment tests create links through
  `tests/_helpers/filesystem-links.ts`, which uses directory junctions on
  Windows. Normalize path separators before comparing paths or module ids.

### Tests and evals

- Assert memory writes with `context.memory.has(memoryKeys.task("..."))` or
  `context.memory.subscribe(...)`, not spies on `set`.
- Use `tests/_helpers/mock-context.ts` for a context with a real
  `AgentMemory`.
- Eval scoring is structural: required tools, forbidden tools, bounds and
  substrings. Do not assert an exact transcript.
- Harness tests run against a scripted provider with no network. Live eval
  runs happen on request.

## Authoring Agent Nodes — Pitfalls

When building a node that wraps an agent (e.g. `llm-nodes` `AgentNode`):

- **Every tool named in an agent's system prompt must actually be registered in
  its toolset.** A prompt-referenced-but-unregistered tool is a silent
  no-op. Resolve real builtin tools (`resolveBuiltinAgentTool`) and don't reference
  tools you didn't wire.
- **Every declared prop must be consumed by `process()` or injected into the
  prompt.** A declared-but-unwired prop (`max_output_chars`, `url`, `output_dir`)
  does nothing.
- **`yield` structured results so the kernel routes them to dynamic output
  handles; don't `return` them from a generator** (`yield*` discards the return
  value). Keep structured-output emission consistent across modes (loop vs plan).
