---
layout: page
title: "Agent Memory System"
permalink: /agent-memory
description: "Unified, structured memory shared by every agent, task, and step in NodeTool — accessed via tool calls with progressive disclosure."
---

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [Agent System](AGENTS.md) → **Agent Memory**

The **agent memory system** is the single source of truth for everything that flows between agents, tasks, steps, sub-agents, and tools during a workflow run. One `AgentMemory` instance lives on every `ProcessingContext` as `context.memory`. All executors read from and write to it through a single namespaced API, and every agent accesses it through three auto-attached tools:

- `memory_list` — discover what's available (metadata only)
- `memory_read` — fetch full values for specific keys
- `memory_write` — publish a value under the `shared:` namespace

This page is the comprehensive reference. For a quick orientation, jump to [Quick Reference](#quick-reference) or [Examples](#examples).

---

## Why This Exists

Earlier versions of the agent system kept results in three uncoordinated stores (`context._variables`, `ParallelTaskExecutor.taskResults`, `TaskBoard.task.result`) and had each agent type deliver upstream results to the LLM differently. Plan mode replaced the default execution prompt with a "dependency context" block that stripped the `finish_step` discipline, so downstream tasks routinely lost results.

The fix is one store, one API, and one access pattern — **progressive disclosure via tool calls**:

- **Auto-injection is wasteful**: dumping all upstream results into every prompt bloats context with data the step rarely needs.
- **Tool-mediated access is selective**: the agent sees a tiny "what's available" hint in the system prompt and pulls only the values it actually needs.
- **Specific declared dependencies still get a nudge**: if the planner declared `task.dependsOn` or `step.dependsOn`, those exact memory keys appear in the user message as a hint — but the values are not included.

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
  (writes step:,         (passes task.dependsOn      (subscribes to
   task: on              IDs as upstream key          TaskBoard, mirrors
   finish-task steps;    hints to TaskExecutor)       completed tasks;
   auto-attaches                                      adds memory tools
   memory_list /                                      to shared toolset)
   memory_read /
   memory_write tools)
```

Every executor writes results into `context.memory`. Every step has the three memory tools available automatically, and the system prompt instructs the model when to use them.

---

## Key Namespaces

| Namespace | Helper | Written By | Used For |
|---|---|---|---|
| `step:<id>` | `memoryKeys.step(id)` | `StepExecutor`, `TaskExecutor` (process mode) | Per-step results |
| `task:<id>` | `memoryKeys.task(id)` | `StepExecutor` (finish-task steps), `ParallelTaskExecutor`, `TeamExecutor` | Per-task results |
| `input:<key>` | `memoryKeys.input(key)` | `TaskExecutor`, `ParallelTaskExecutor`, `AgentStepExecutor` | Caller-supplied inputs and edge inputs |
| `shared:<key>` | `memoryKeys.shared(key)` | `memory_write` tool | Cross-agent communication, scratch space |

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
  /** Categorization for filtering and rendering. */
  kind: "task_result" | "step_result" | "input" | "shared";
  /** Stored value (any JSON-serializable structure). */
  value: unknown;
  /** Optional ID of the producer (task / step / agent / tool). */
  source?: string;
  /** Optional human-readable title shown in `memory_list`. */
  title?: string;
  /** Optional brief description. */
  description?: string;
  /** Wall-clock ms when the entry was first written. */
  createdAt: number;
}
```

`title` and `description` flow through to `memory_list` output, so set them when you want the LLM to see a friendly label rather than a UUID.

---

## Memory Tools (the LLM-facing API)

Three tools are auto-attached to every `StepExecutor` and to `TeamExecutor`'s shared tool list. Their schemas are documented at the top of every default execution system prompt so the model knows when to call them.

### `memory_list`

Discover available entries without paying for their values.

```jsonc
// args
{
  "kind": ["task_result", "shared"],   // optional filter
  "key_prefix": "task:",                // optional filter
  "sources": ["research", "summary"]    // optional filter
}

// result
{
  "total": 4,
  "returned": 4,
  "truncated": false,
  "entries": [
    {
      "key": "task:research",
      "kind": "task_result",
      "title": "Research findings",
      "description": "Top three sources from the web search step.",
      "source": "research",
      "valueBytes": 142,
      "createdAt": "2026-05-07T14:00:01.234Z"
    }
    // ...
  ]
}
```

`valueBytes` is the size of the JSON-serialized value — useful for the model to budget reads. The result is hard-capped at 200 entries; older entries are truncated and reported via `truncated: true`.

### `memory_read`

Fetch full values for one or more keys.

```jsonc
// args
{ "keys": ["task:research", "step:summary"] }

// result
{
  "entries": {
    "task:research": {
      "key": "task:research",
      "kind": "task_result",
      "value": { "findings": ["alpha", "beta"] },
      "source": "research",
      "title": "Research findings",
      "createdAt": 1700000000000
    }
  },
  "missing": ["step:summary"]
}
```

Missing keys are reported in `missing` so the model can decide whether to retry, list again, or proceed without them.

### `memory_write`

Publish a value under the `shared:` namespace so other agents and steps can discover it via `memory_list`.

```jsonc
// args
{
  "key": "top_source",                 // suffix; stored as "shared:top_source"
  "value": "https://example.com",
  "title": "Top source URL",
  "description": "Picked by the researcher agent."
}

// result
{ "ok": true, "key": "shared:top_source", "kind": "shared", "createdAt": "..." }
```

Writes are restricted to the `shared:` namespace to prevent agents from spoofing step / task / input results.

---

## Direct API Reference

The `AgentMemory` class lives in `packages/runtime/src/agent-memory.ts` and is re-exported from `@nodetool-ai/runtime`. Tools and executors use this API directly; agents reach it only through the three memory tools above.

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
context.memory.get(memoryKeys.task("research"));        // MemoryEntry | undefined
context.memory.getValue<T>(memoryKeys.task("research")); // T | undefined
context.memory.has(memoryKeys.task("research"));        // boolean
context.memory.snapshot();                              // MemoryEntry[]
```

### Listing & Filtering

```ts
context.memory.list();                                    // all
context.memory.list({ kind: "task_result" });
context.memory.list({ kind: ["task_result", "input"] });
context.memory.list({ keys: ["task:research", "task:report"] });
context.memory.list({ keyPrefix: "step:" });
context.memory.list({ sources: ["research"] });
```

### Subscriptions

```ts
const unsubscribe = context.memory.subscribe((entry) => {
  console.log(`memory write: ${entry.key} (${entry.kind})`);
});
// later...
unsubscribe();
```

`TeamExecutor` uses this to mirror `TaskBoard` task completions into shared memory. UIs can use it to render a live memory side panel.

### Clearing

```ts
context.memory.clear();                          // wipe everything
context.memory.clear({ kind: "step_result" });   // selective
context.memory.clear({ keyPrefix: "input:" });   // by prefix
```

---

## How Each Agent Type Uses Memory

### StepExecutor (`packages/agents/src/step-executor.ts`)

The execution engine for a single step.

**Writes**:

| Trigger | Key | Kind |
|---|---|---|
| Always | `step:<step.id>` | `step_result` |
| Last step of a task (finish-task) | `task:<task.id>` | `task_result` |
| Step exhausted iterations | `step:<step.id>` (with `{ error }`) | `step_result` |

**LLM access**:

- The default execution system prompts (`DEFAULT_EXECUTION_SYSTEM_PROMPT`, `DEFAULT_FINISH_TASK_SYSTEM_PROMPT`, `DEFAULT_UNSTRUCTURED_SYSTEM_PROMPT`) include a `## Memory Tools (progressive disclosure)` section that explains how to use the tools.
- The user message includes only **specific declared upstream keys** as a hint:
  - `step:<id>` for every entry of the step's `dependsOn` (intra-task deps).
  - any key supplied via `StepExecutorOptions.upstreamMemoryKeys` (typically `task:<id>` from the parent task's `dependsOn`).
- Values are not included; the agent calls `memory_read` to fetch them.

**Tool attachment**: `getMemoryTools()` is auto-pushed into the step's tool list at construction time, alongside any caller-supplied tools and (when the step has a schema) `finish_step`. The conclusion stage strips everything except `finish_step`.

**Custom prompts are preambles, not replacements**: A caller-supplied `systemPrompt` is layered before the default execution prompt, so the contract — including the memory-tool documentation and `finish_step` discipline — is non-bypassable.

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

`TaskExecutor` accepts an optional `upstreamMemoryKeys` array (e.g. `task:<id>` keys from the parent plan). It forwards this verbatim to every `StepExecutor` it creates.

### ParallelTaskExecutor (`packages/agents/src/parallel-task-executor.ts`)

Runs a `TaskPlan` of multiple tasks as a DAG. It owns no private result map — everything lives in `context.memory`.

| Operation | Memory Action |
|---|---|
| Startup: seed inputs | `set` each as `input:<key>` |
| For each task: derive upstream keys | `task.dependsOn.map(memoryKeys.task)` → forwarded as `upstreamMemoryKeys` to `TaskExecutor` |
| After task executor completes | If no `is_task_result` was emitted, fall back to `step:<lastStepId>` |
| Idempotent task write | `set` `task:<task.id>` only if not already present |
| Read final result | `getFinalResult()` returns `getValue(task:<lastTaskId>)` |
| Read all results | `getAllResults()` lists all `task_result` entries |
| Read specific task | `getTaskResult(id)` |

Downstream tasks see their declared upstream task keys as hints in the step user message and pull values via `memory_read` when needed.

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

Each agent's tool set includes the memory tools alongside the team tools and any caller-supplied shared tools. The team system prompt has a `## Shared Memory (progressive disclosure)` section instructing teammates to use `memory_list` / `memory_read` to discover and fetch each other's results.

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

The result is written under `step:<node.id>` by `StepExecutor`, so subsequent agent steps in the same workflow graph discover prior nodes' outputs through `memory_list`.

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
               ├─ buildSystemPrompt() → default execution prompt
               │     (includes "Memory Tools" section)
               ├─ buildUserMessage() → instructions
               │     + "Required upstream memory" hint listing
               │       declared dependency keys (no values)
               ├─ LLM streams → may emit:
               │     - memory_list  → returns metadata
               │     - memory_read  → returns values for chosen keys
               │     - memory_write → publishes shared facts
               │     - other tools / finish_step
               ├─ finish_step received → storeCompletionResult()
               │     ├─ context.memory.set({ key: "step:<id>", ... })
               │     └─ if useFinishTask:
               │         context.memory.set({ key: "task:<id>", ... })
               └─ yield step_result
3. ParallelTaskExecutor: ensure task: entry exists (idempotent)
4. Mark task.completed = true → unblocks downstream tasks
5. Next iteration: downstream tasks now executable. Their step user
   messages name the upstream task keys; agents call memory_read when
   they actually need the values.
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

### What the LLM sees (system prompt extract)

The default execution system prompt includes:

```markdown
## Memory Tools (progressive disclosure)
- Shared agent memory holds results from prior steps and tasks, original
  inputs, and facts published by other agents.
- Memory contents are NOT auto-included in your prompt. If you need upstream
  context, discover it on demand:
  1. Call `memory_list` to see what's available (returns metadata only —
     keys, titles, kinds, byte sizes).
  2. Call `memory_read` with the specific keys you actually need; it returns
     full values.
  3. Call `memory_write` to publish a value under `shared:<key>` so other
     agents can find it via `memory_list`.
- Pull only what you need — don't fetch every entry by reflex.
```

And the user message for a step that depends on `task:research_phase` looks like:

```markdown
Write a report from the upstream findings.

# Required upstream memory (call `memory_read` with these keys):
- task:research_phase — Research findings
```

The model then chooses whether to call `memory_read` or proceed.

### Pre-populate memory before running

Useful for tests or for restoring state from a checkpoint:

```ts
context.memory.set({
  key: memoryKeys.task("prior_research"),
  kind: "task_result",
  value: cachedFindings,
  source: "prior_research",
  title: "Cached prior research",
  description: "Findings from a previous run; reuse instead of re-researching."
});

const agent = new MultiModeAgent({
  name: "follow-up",
  objective: "Build on the prior research findings.",
  /* ... */,
  mode: "plan"
});
// The agent's first memory_list call will surface this entry.
```

### Tool that publishes to shared memory directly (without an LLM round-trip)

For deterministic publish-from-code use cases, write to the API directly:

```ts
context.memory.set({
  key: memoryKeys.shared("top_source"),
  kind: "shared",
  value: "https://example.com/article",
  source: "data_pipeline",
  title: "Top source URL"
});
```

Subsequent agents will see this via `memory_list` and can fetch it via `memory_read`.

### Subscribe in a host application (UI sidebar)

```ts
const unsubscribe = context.memory.subscribe((entry) => {
  ui.appendMemoryEntry(entry); // render the new entry in a side panel
});
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

// Subscribe
const off = context.memory.subscribe((entry) => { /* ... */ });

// Clear
context.memory.clear({ kind: "step_result" });
```

LLM-facing tools (auto-attached to every step):

| Tool | Purpose | Returns |
|---|---|---|
| `memory_list` | Discover entries (metadata only) | `{ total, returned, entries: [...] }` |
| `memory_read` | Fetch full values for specific keys | `{ entries: { ... }, missing: [...] }` |
| `memory_write` | Publish under `shared:<key>` | `{ ok, key, kind, createdAt }` |

---

## Design Decisions

**Why progressive disclosure and not auto-injection?**
Auto-injecting every memory entry into every prompt is wasteful. Most steps need one or two specific upstream values; dumping all of them costs tokens and pollutes attention. Progressive disclosure mirrors how a human researcher works: scan the index, fetch the specific document, ignore the rest.

**Why expose memory through tools instead of a dedicated channel?**
Models in 2026 are excellent tool callers — and tools come with rich JSON schemas that make discovery, filtering, and parameter validation trivial. Adding bespoke prompt syntax for memory access would be reinventing function calling. Tools also give us first-class observability: every memory access shows up as a `tool_call_update` in the message stream.

**Why is `memory_write` restricted to `shared:`?**
Step results, task results, and inputs are owned by the executors. Letting an agent overwrite a `task:<id>` entry would let it spoof the result of work it didn't actually do, breaking the audit trail. Agents publish under `shared:` and the executor namespaces stay tamper-proof.

**Why does the user message still mention specific upstream keys?**
A pure tool-only design would force the agent to call `memory_list` even when the planner already declared the dependency. That's an unnecessary round trip for a known-relevant key. The user message names exactly the keys the planner pinned (`step.dependsOn` plus parent-task `dependsOn`), so the agent can go straight to `memory_read` for declared deps and use `memory_list` only when it needs to discover beyond them.

**Why a single map and not a relational store?**
Agent runs are short-lived and the data is small (typically tens of entries). A `Map` plus structured rendering covers every observed use case without the operational cost of a database. Persistent storage belongs in the asset / vector layer.

**Why namespaced string keys instead of typed IDs?**
The LLM has to read keys back from the tool result and pass them to `memory_read`. Strings round-trip cleanly through prompts and logs without serialization games.

**Why isn't memory shared across `context.copy()`?**
Copies are designed for isolated sub-runs. If a sub-run should inherit memory, the caller can `set` entries from the parent before kicking it off. Default isolation is the safer choice.

**Why does `customPrompt` no longer replace the default execution prompt?**
Replacing it stripped the memory-tool documentation and the `finish_step` discipline. The fix layers any caller preamble before the default prompt rather than replacing it. The execution contract (memory tools, output schema, completion protocol, conclusion-stage rules) is now non-bypassable.

---

## Troubleshooting

**Symptom:** A downstream task's prompt shows the upstream key hint but the agent never calls `memory_read`.
- The model may have decided it doesn't need the value. If you know it should, make the user instructions more explicit ("read the upstream findings via memory_read before writing").
- Check the conclusion stage: if the step is at >90% token budget, only `finish_step` is allowed and `memory_read` is filtered out.

**Symptom:** Task result key is missing after the step yielded `step_result` with `is_task_result: true`.
- `StepExecutor` only writes `task:<id>` for steps where `useFinishTask === true`. That flag is set by `TaskExecutor.isFinishStep()` for the last step in the task (or the explicit `finalStepId` option). Steps in the middle of a task only write `step:<id>`.
- For belt-and-suspenders, `ParallelTaskExecutor` performs an idempotent task-result write after each task, falling back to the last step's value.

**Symptom:** Cross-agent results not visible in `TeamExecutor` agents.
- Verify the board emitted `task_completed` events. The mirror subscription only fires on that event type — tasks that fail or stay `working` won't be mirrored.
- Check that `context.memory.has(memoryKeys.task(taskId))` is true after the relevant teammate completes its work.
- Confirm the agent's tool list includes the memory tools: `getMemoryTools()` is automatically added to every team iteration.

**Symptom:** Tests pass but memory entries seem stale across test runs.
- A new `AgentMemory` instance is constructed for every `ProcessingContext`. If you reuse a context across tests, call `context.memory.clear()` between them.

**Symptom:** Agent calls `memory_list` and gets `truncated: true`.
- The list response is hard-capped at 200 entries. If you need more, narrow the filter (`kind`, `key_prefix`, or `sources`) — or accept that for very long runs, only the most recent 200 are visible at once.

---

## Related

- [Agent System](AGENTS.md) — overall architecture
- `packages/runtime/src/agent-memory.ts` — `AgentMemory` implementation
- `packages/agents/src/tools/memory-tools.ts` — `memory_list` / `memory_read` / `memory_write`
- `packages/agents/tests/memory-propagation.test.ts` — end-to-end propagation tests including the tool round-trip
- `packages/agents/tests/memory-tools.test.ts` — unit tests for the memory tools
- `packages/runtime/tests/agent-memory.test.ts` — `AgentMemory` unit tests
