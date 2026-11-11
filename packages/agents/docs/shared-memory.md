# Agent Memory (`@nodetool-ai/runtime` → `context.memory`)

**Navigation**: [Agents package rules](../AGENTS.md) → **Agent Memory**

Paths are relative to `packages/agents/` unless they name another package.

Every `ProcessingContext` carries an `AgentMemory` instance at `context.memory`. It is the **single source of truth** for everything shared between steps, tasks, sub-agents, and tools. Do not introduce a parallel result map in any executor — read and write through `context.memory`.

### Access pattern: progressive disclosure via tools

Memory contents are NOT auto-injected into prompts. Agents access memory through three capabilities that are auto-attached to every step (and to every team iteration). They are the `shared` capability module (`src/capabilities/shared.ts`) — kept apart from `memory`, which is the user's durable store and a different lifetime — and `getSharedTools()` (`src/tools/shared-tools.ts`) is the belt the executors mount them from:

| Tool | Object model | Purpose |
|---|---|---|
| `list_shared` | `nodetool.shared.list(filters)` | Discover available entries (metadata only — keys, titles, kinds, byte sizes) |
| `read_shared` | `nodetool.shared.read(keys)` | Fetch full values for specific keys |
| `share_result` | `nodetool.shared.publish(key, value, {title, description})` | Publish a value under `shared:<key>` |

The default execution system prompt documents the `nodetool.shared` form, and the three wire names drop out of the raw tool catalog the way every other wrapped tool does. The user message names only **specific** upstream keys the planner pinned (`step.dependsOn` plus parent-task `dependsOn` via `upstreamMemoryKeys`) — values are pulled on demand.

### Key namespaces

```ts
import { memoryKeys } from "@nodetool-ai/runtime";

memoryKeys.step("step_1");         // "step:step_1"  — step result
memoryKeys.task("research_phase"); // "task:research_phase"  — task result
memoryKeys.input("customer");      // "input:customer"  — caller-supplied input
memoryKeys.shared("note");         // "shared:note"  — cross-agent scratch
```

### Who writes what

| Writer | Trigger | Key | Kind |
|---|---|---|---|
| `CodeActExecutor` | Step completion | `step:<step.id>` | `step_result` |
| `CodeActExecutor` | Last step of a task (finish-task) | `task:<task.id>` | `task_result` |
| `TaskExecutor` | Startup / terminal step failure | `input:<key>` / `step:<step.id>` | `input` / `step_result` |
| `ParallelTaskExecutor` | After a task completes (idempotent) | `task:<task.id>` | `task_result` |
| `share_result` tool | Agent / sub-agent publish | `shared:<key>` | `shared` |

`share_result` is restricted to the `shared:` namespace so agents can't spoof step / task / input results. Internal executors write directly through `context.memory.set` for their owned namespaces.

### Custom prompts are preambles, not replacements

A step executor always builds the default execution prompt (the CodeAct action contract, the output schema, the `finish()` discipline). A caller-supplied `systemPrompt` is layered as a preamble *before* the default — it cannot override the execution contract. Earlier versions allowed this and broke result capture in plan mode.

`TaskPlanner` follows the same rule, and did not until recently: a caller's
`systemPrompt` replaced the whole TaskArchitect contract — ID rules,
parallelism, output schemas, "synthesis is not your job". Every `AgentNode`
supplies one (default: "You are a friendly assistant"), so every node-driven
plan was authored without it. It is a preamble now.

The contract's tool-dependent half is conditional on the run's toolbelt. With
tools it carries the `find_model` / `generate_*` / `save_asset` instructions;
with an empty belt it carries `## No Execution Tools` instead, and the planner
is told to plan only what a model can do from its own knowledge. Advertising
tools no step can call produced research plans whose every step was the
model's own recall.

### Final synthesis: the calling loop's next turn

There is no synthesis stage. `execute_plan` runs the DAG, writes each task's
result to `task:<id>`, and returns those values with the tasks; the loop that
called it then writes the answer on its next turn, reading `task:<id>` via
`read_shared` for anything the return did not carry. That is what
`execute_plan`'s own description tells the model to do.

The planner is still told NOT to create an aggregation/synthesis task: a step
that assembles the answer duplicates the turn that follows the call, and it
does it with a smaller view of the run than the caller has.

### Threading task-level deps through executors

`ParallelTaskExecutor` derives `task.dependsOn.map(memoryKeys.task)` and forwards it as `upstreamMemoryKeys` to `TaskExecutor`, which forwards it verbatim to every step executor. The step's user message renders these as `- task:<id>` hints next to the intra-task `step:<id>` deps. The agent calls `read_shared` when it needs the values.

### Tests

- `packages/runtime/tests/agent-memory.test.ts` — unit tests for `AgentMemory`
- `packages/agents/tests/shared-tools.test.ts` — unit tests for the `shared` capabilities `list_shared` / `read_shared` / `share_result`, and the belt `getSharedTools()` builds from them
- `packages/agents/tests/memory-propagation.test.ts` — end-to-end through `execute_plan`, `TaskExecutor` and `StepExecutor`, including a fake-provider round trip that drives `list_shared` → `read_shared` → `finish_step`
- `packages/agents/tests/_helpers/mock-context.ts` — shared mock context with a real `AgentMemory` for executor tests

When asserting memory writes in tests, prefer `context.memory.has(memoryKeys.task("..."))` and `context.memory.subscribe(...)` over spies on `set` / `storeStepResult`.

For the full API reference, tool schemas, propagation flow, design decisions, and troubleshooting, see [docs/agent-memory.md](../../../docs/agent-memory.md).
