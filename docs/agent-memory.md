---
layout: page
title: "Agent Memory System"
permalink: /agent-memory
description: "Unified, structured memory shared by every agent, task, and step in NodeTool — design, API, and propagation rules."
---

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [Agent System](AGENTS.md) → **Agent Memory**

The **agent memory system** is the single source of truth for everything that flows between agents, tasks, steps, sub-agents, and tools during a workflow run. One `AgentMemory` instance lives on every `ProcessingContext` as `context.memory`. All executors read from it and write to it through a single namespaced API.

This page is the comprehensive reference. For a quick orientation, jump to [Quick Reference](#quick-reference) or [Examples](#examples).

---

## Why This Exists

Earlier versions of the agent system kept results in three uncoordinated stores:

| Store | Owner | Used For |
|---|---|---|
| `ProcessingContext._variables` | Runtime | Step results (`storeStepResult`), inputs |
| `ParallelTaskExecutor.taskResults` | Plan-mode executor (private map) | Task-level results in plan mode |
| `TaskBoard.task.result` | TeamExecutor | Task-level results in multi-agent mode |

The three drifted out of sync. Worse, each agent type had its own way to deliver upstream results to the LLM:

- `StepExecutor` injected dependency results into the *user message*, but only iterated `step.dependsOn` (intra-task) — task-level dependencies were invisible at this layer.
- `ParallelTaskExecutor` built an "enhanced system prompt" that **replaced** the default execution prompt — discarding the `finish_step` discipline and breaking result capture.
- `TeamExecutor` re-rendered prompts from `TaskBoard.task.result` and passed nothing through `context`.

The fix is one store, one API, one rendering.

---

## Architecture

```
                    ┌──────────────────────────────────┐
                    │     ProcessingContext.memory     │
                    │                                  │
                    │  Map<string, MemoryEntry>        │
                    │                                  │
                    │  step:<id>   step_result         │
                    │  task:<id>   task_result         │
                    │  input:<key> input               │
                    │  shared:<k>  shared              │
                    └────────────┬─────────────────────┘
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │                         │                         │
       ▼                         ▼                         ▼
  StepExecutor           ParallelTaskExecutor        TeamExecutor
  (writes step:,         (reads task: deps,         (subscribes to
   task: on              writes task: results)       TaskBoard, mirrors
   finish-task steps)                                completed tasks)
```

Every executor writes results into `context.memory`. Every step gets a Markdown snapshot of relevant memory entries injected into its user message via `AgentMemory.formatForPrompt()`. Downstream tasks discover upstream results without any side channel.

---

## Key Namespaces

| Namespace | Helper | Written By | Used For |
|---|---|---|---|
| `step:<id>` | `memoryKeys.step(id)` | `StepExecutor`, `TaskExecutor` (process mode) | Per-step results |
| `task:<id>` | `memoryKeys.task(id)` | `StepExecutor` (finish-task steps), `ParallelTaskExecutor`, `TeamExecutor` | Per-task results |
| `input:<key>` | `memoryKeys.input(key)` | `TaskExecutor`, `ParallelTaskExecutor`, `AgentStepExecutor` | Caller-supplied inputs and edge inputs |
| `shared:<key>` | `memoryKeys.shared(key)` | Tools, custom code | Cross-agent communication, scratch space |

Always use the helper functions when constructing keys — they prevent typos and make grep-able call sites.

```ts
import { memoryKeys } from "@nodetool-ai/runtime";

context.memory.has(memoryKeys.task("research_phase"));
context.memory.getValue(memoryKeys.step("step_1"));
```

---

## Memory Entry Shape

```ts
export interface MemoryEntry {
  /** Globally unique key (use memoryKeys.*). */
  key: string;
  /** Categorization for filtering and prompt rendering. */
  kind: "task_result" | "step_result" | "input" | "shared";
  /** Stored value (any JSON-serializable structure). */
  value: unknown;
  /** Optional ID of the producer (task / step / agent / tool). */
  source?: string;
  /** Optional human-readable title used as the prompt heading. */
  title?: string;
  /** Optional brief description rendered alongside the title. */
  description?: string;
  /** Wall-clock ms when the entry was first written. */
  createdAt: number;
}
```

`title` and `description` flow through to prompt rendering, so set them when you want the LLM to see a friendly label rather than a UUID.

---

## API Reference

The full class lives in `packages/runtime/src/agent-memory.ts` and is re-exported from `@nodetool-ai/runtime`.

### Writing

```ts
context.memory.set({
  key: memoryKeys.task("research"),
  kind: "task_result",
  value: { findings: ["alpha", "beta"] },
  source: "research",
  title: "Research findings",
  description: "Top three sources from the web search step."
});
```

`set` returns the persisted `MemoryEntry`. Repeated writes for the same key overwrite the value but preserve the original `createdAt`.

### Reading

```ts
// Full entry (kind, source, title, ...)
const entry = context.memory.get(memoryKeys.task("research"));

// Just the value (no metadata)
const findings = context.memory.getValue<{ findings: string[] }>(
  memoryKeys.task("research")
);

// Existence check
context.memory.has(memoryKeys.task("research"));

// Snapshot (insertion order)
context.memory.snapshot();
```

### Listing & Filtering

```ts
// All entries (no filter)
context.memory.list();

// Single kind
context.memory.list({ kind: "task_result" });

// Multiple kinds
context.memory.list({ kind: ["task_result", "input"] });

// Specific keys
context.memory.list({ keys: ["task:research", "task:report"] });

// Prefix match
context.memory.list({ keyPrefix: "step:" });

// By producer
context.memory.list({ sources: ["research", "summary"] });
```

### Prompt Rendering

```ts
const block = context.memory.formatForPrompt({
  kind: ["task_result", "step_result", "input"]
});
```

`formatForPrompt` returns a Markdown block ready to inject into a user/system prompt. It sorts entries by `createdAt` ascending and renders each as:

```markdown
## [task_result] Research findings (task:research)
Top three sources from the web search step.
```
{
  "findings": ["alpha", "beta"]
}
```
```

When no entries match the filter, it returns an empty string. The default user-message injection in `StepExecutor.buildUserMessage` filters by `task_result | step_result | input`.

### Subscriptions

```ts
const unsubscribe = context.memory.subscribe((entry) => {
  console.log(`memory write: ${entry.key} (${entry.kind})`);
});
// later...
unsubscribe();
```

Subscribers fire synchronously on every `set`. `TeamExecutor` uses this to mirror `TaskBoard` task completions into shared memory, and tests use it to capture write order.

### Clearing

```ts
context.memory.clear();                          // wipe everything
context.memory.clear({ kind: "step_result" });   // selective
context.memory.clear({ keyPrefix: "input:" });   // by prefix
```

---

## How Each Agent Type Uses Memory

### StepExecutor (`packages/agents/src/step-executor.ts`)

The execution engine for a single step. On completion, it writes:

| Trigger | Key | Kind |
|---|---|---|
| Always | `step:<step.id>` | `step_result` |
| Last step of a task (finish-task) | `task:<task.id>` | `task_result` |
| Step exhausted iterations | `step:<step.id>` (with `{ error }`) | `step_result` |

Before each LLM call, `buildUserMessage()` renders the full memory snapshot of `task_result + step_result + input` into the user message. This guarantees the LLM sees **every** prior result, not just declared `dependsOn` IDs — protection against under-specified plans.

`buildSystemPrompt()` always uses the default execution prompt (with output-schema and `finish_step` directives). A caller-supplied `systemPrompt` is layered as a *preamble*, never replacing the defaults. This is the key fix for plan-mode reliability — earlier versions allowed the parent's prompt to clobber the execution discipline.

### TaskExecutor (`packages/agents/src/task-executor.ts`)

Walks the step DAG of a single task. On startup it seeds caller inputs:

```ts
for (const [key, value] of Object.entries(this.inputs)) {
  this.context.memory.set({
    key: memoryKeys.input(key),
    kind: "input",
    value,
    title: key
  });
}
```

In **process mode** (fan-out over a discover step's list), it reads the discover result via `memoryKeys.step(discoverStepId)` and writes the aggregated array back under `memoryKeys.step(processStepId)` after collecting per-item results.

### ParallelTaskExecutor (`packages/agents/src/parallel-task-executor.ts`)

Runs a `TaskPlan` of multiple tasks as a DAG. It owns no private result map — everything lives in `context.memory`.

| Operation | Memory Action |
|---|---|
| Startup: seed inputs | `set` each as `input:<key>` |
| Schedule task | (no memory access — purely structural via `task.completed`) |
| After task executor completes | If no `is_task_result` was emitted, fall back to `step:<lastStepId>` |
| Idempotent task write | `set` `task:<task.id>` only if not already present (StepExecutor already wrote it for finish-task steps) |
| Read final result | `getFinalResult()` returns `getValue(task:<lastTaskId>)` |
| Read all results | `getAllResults()` lists all `task_result` entries |
| Read specific task | `getTaskResult(id)` |

Downstream tasks discover upstream task results through `StepExecutor.buildUserMessage` — no special prompt assembly needed in this layer.

### TeamExecutor (`packages/agents/src/team/team-executor.ts`)

Multi-agent mode using a shared `TaskBoard` + `MessageBus`. On startup, `execute()` subscribes to board events:

```ts
this.board.onEvent((event) => {
  if (event.type !== "task_completed") return;
  const task = this.board.get(event.taskId);
  if (!task) return;
  this.context.memory.set({
    key: memoryKeys.task(task.id),
    kind: "task_result",
    value: task.result,
    source: task.id,
    title: task.title,
    description: task.description
  });
});
```

Every time an agent completes a task on the board, the result is mirrored into shared memory. Other agents see it in their next `runAgentWorkCycle()`, which now injects:

```ts
const memoryBlock = this.context.memory.formatForPrompt({
  kind: ["task_result", "shared", "input"]
});
```

This makes the team's execution loop equivalent to plan mode from the LLM's perspective: every teammate's completed work is visible.

### AgentStepExecutor (`packages/agents/src/agent-step-executor.ts`)

The bridge between the kernel's workflow runner and the agent system. When a workflow node of type `nodetool.agents.AgentStep` runs, this adapter wraps `StepExecutor`. It also surfaces upstream **edge** inputs into memory:

```ts
for (const [key, value] of Object.entries(inputs)) {
  if (value === undefined || value === null) continue;
  context.memory.set({
    key: memoryKeys.input(`${this.node.id}.${key}`),
    kind: "input",
    value,
    source: this.node.id,
    title: `${this.node.id}.${key}`
  });
}
```

The result is written under `step:<node.id>` by `StepExecutor`, so subsequent agent steps in the same workflow graph see prior nodes' outputs through memory automatically.

### MultiModeAgent (`packages/agents/src/multi-mode-agent.ts`)

The top-level dispatcher (`loop` / `plan` / `multi-agent` modes). Memory itself is mode-independent: each mode delegates to the executor above, which all use `context.memory`.

---

## Propagation Flow

This is the canonical end-to-end flow for a multi-task plan:

```
1. Caller: agent.execute(context)
2. ParallelTaskExecutor.execute()
   ├─ Seed inputs:  context.memory.set({ kind: "input", ... })
   └─ For each executable task:
      └─ TaskExecutor.executeTasks()
         └─ For each step:
            └─ StepExecutor.execute()
               ├─ buildUserMessage() →
               │     prompt includes formatForPrompt({
               │       kind: ["task_result", "step_result", "input"]
               │     })
               ├─ LLM streams → tool calls
               ├─ finish_step received → storeCompletionResult()
               │     ├─ context.memory.set({ key: "step:<id>", ... })
               │     └─ if useFinishTask:
               │         context.memory.set({ key: "task:<id>", ... })
               └─ yield step_result
3. ParallelTaskExecutor: ensure task: entry exists (idempotent)
4. Mark task.completed = true → unblocks downstream tasks
5. Next iteration: downstream tasks now executable, see all prior
   memory entries via buildUserMessage
```

The same flow applies to `TeamExecutor` with the board-event subscription standing in for the explicit task-result write.

---

## Examples

### Inspect memory at the end of an agent run

```ts
import { Agent } from "@nodetool-ai/agents";
import { memoryKeys } from "@nodetool-ai/runtime";

const agent = new Agent({ /* ... */ });
for await (const _msg of agent.execute(context)) { /* drain */ }

console.log("Final result:", agent.getResults());
console.log("All task results:", context.memory.list({ kind: "task_result" }));
console.log(
  "Specific task:",
  context.memory.getValue(memoryKeys.task("research_phase"))
);
```

### Tool that publishes to shared memory

```ts
import { Tool } from "@nodetool-ai/agents";
import { memoryKeys } from "@nodetool-ai/runtime";

class PublishFactTool extends Tool {
  readonly name = "publish_fact";
  readonly description = "Publish a fact into shared agent memory.";
  readonly inputSchema = {
    type: "object",
    properties: {
      key: { type: "string" },
      value: { type: "string" }
    },
    required: ["key", "value"]
  };

  async process(context, params) {
    context.memory.set({
      key: memoryKeys.shared(String(params.key)),
      kind: "shared",
      value: params.value,
      source: this.name,
      title: `Fact: ${params.key}`
    });
    return { ok: true };
  }
}
```

Subsequent steps will see the fact in their user-message memory block automatically — no edges, no plumbing.

### Subscribe in a host application (UI sidebar)

```ts
const unsubscribe = context.memory.subscribe((entry) => {
  ui.appendMemoryEntry(entry); // render the new entry in a side panel
});
// ...
unsubscribe();
```

### Pre-populate memory before running

Useful for tests or for restoring state from a checkpoint:

```ts
context.memory.set({
  key: memoryKeys.task("prior_research"),
  kind: "task_result",
  value: cachedFindings,
  source: "prior_research",
  title: "Cached prior research"
});

const agent = new MultiModeAgent({
  name: "follow-up",
  objective: "Build on the prior research findings.",
  /* ... */,
  mode: "plan"
});
// First step's user message will include the pre-populated entry.
```

---

## Quick Reference

```ts
import { AgentMemory, memoryKeys, type MemoryEntry } from "@nodetool-ai/runtime";

// Already mounted on every ProcessingContext
context.memory; // AgentMemory

// Write
context.memory.set({
  key: memoryKeys.task("t1"),
  kind: "task_result",
  value: result,
  source: "t1",
  title: "Task One"
});

// Read
context.memory.get(memoryKeys.task("t1"));        // MemoryEntry | undefined
context.memory.getValue(memoryKeys.task("t1"));   // unknown | undefined
context.memory.has(memoryKeys.task("t1"));        // boolean

// List / filter
context.memory.list({ kind: "task_result" });
context.memory.list({ keyPrefix: "step:" });
context.memory.list({ sources: ["research"] });

// Render for prompts
context.memory.formatForPrompt({ kind: ["task_result", "input"] });

// Subscribe
const off = context.memory.subscribe((entry) => { /* ... */ });

// Clear
context.memory.clear({ kind: "step_result" });
```

---

## Design Decisions

**Why a single map and not a relational store?**
Agent runs are short-lived and the data is small (typically tens of entries). A `Map` plus structured rendering covers every observed use case without the operational cost of a database. Persistent storage belongs in the asset / vector layer, not in working memory.

**Why namespaced string keys instead of typed IDs?**
The LLM has to read the keys back from the prompt block (e.g. "the result of task `task:research_phase` was ..."). Strings round-trip cleanly through prompts and logs without serialization games.

**Why include all upstream memory in every step's user message, instead of just `dependsOn`?**
Planners drop edges. Tools surface results the planner never knew about. Sub-agents complete tasks the planner didn't anticipate. Including the full snapshot is the smallest reliable contract — tokens are cheap, missed propagation is expensive. If you ever need to scope visibility per task, the filter API supports it without architectural changes.

**Why isn't memory shared across `context.copy()`?**
Copies are designed for isolated sub-runs. If a sub-run should inherit memory, the caller can `set` entries from the parent before kicking it off, or pass the same context. Default isolation is the safer choice.

**Why does `customPrompt` no longer replace the default execution prompt?**
Replacing it stripped the `finish_step` discipline and broke result capture in plan mode. The fix layers any caller preamble before the default prompt rather than replacing it. The execution contract (output schema, completion protocol, conclusion-stage rules) is now non-bypassable.

---

## Troubleshooting

**Symptom:** A downstream task's prompt contains an empty memory block.
- Check the planner output: did the upstream step have an `outputSchema`? Without one, `StepExecutor` runs in unstructured mode and accepts plain text content as the result. If your mock or model only emits a `finish_step` tool call (no text fallback), the step never completes and never writes to memory.
- Verify the step actually completed: look for `task_update` events with `event: StepCompleted`, and inspect `context.memory.snapshot()`.

**Symptom:** Task result key is missing after the step yielded `step_result` with `is_task_result: true`.
- `StepExecutor` only writes `task:<id>` for steps where `useFinishTask === true`. That flag is set by `TaskExecutor.isFinishStep()` for the last step in the task (or the explicit `finalStepId` option). Steps in the middle of a task only write `step:<id>`.
- For belt-and-suspenders, `ParallelTaskExecutor` also performs an idempotent task-result write after each task, falling back to the last step's value.

**Symptom:** Cross-agent results not visible in `TeamExecutor` agents.
- Verify the board emitted `task_completed` events. The mirror subscription only fires on that event type — tasks that fail or stay `working` won't be mirrored.
- Check that `context.memory.has(memoryKeys.task(taskId))` is true after the relevant teammate completes its work.

**Symptom:** Tests pass but memory entries seem stale across test runs.
- A new `AgentMemory` instance is constructed for every `ProcessingContext`. If you reuse a context across tests, call `context.memory.clear()` between them.

---

## Related

- [Agent System](AGENTS.md) — overall architecture
- `packages/runtime/src/agent-memory.ts` — implementation
- `packages/agents/tests/memory-propagation.test.ts` — end-to-end propagation tests
- `packages/runtime/tests/agent-memory.test.ts` — `AgentMemory` unit tests
