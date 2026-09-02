---
layout: page
title: "Agent Memory System"
permalink: /agent-memory
description: "Unified, structured memory shared by every agent, task, and step in NodeTool — accessed via tool calls with progressive disclosure."
---

**Navigation**: [Chat & Agents](global-chat-agents.md) → **Agent Memory**

> **Not the same as the `memory_*` capabilities.** This page describes per-run scratch space (`context.memory`) shared between the steps of one workflow. For the notes an agent saves durably, across every conversation, see the `memory_*` capabilities.

The **agent memory system** is the single source of truth for everything that flows between agents, tasks, steps, sub-agents, and tools during a workflow run. One `AgentMemory` instance lives on every `ProcessingContext` as `context.memory`. All executors read from and write to it through a single namespaced API, and every agent accesses it through three auto-attached tools:

- `list_shared` — discover what's available (metadata only)
- `read_shared` — fetch full values for specific keys
- `share_result` — publish a value under the `shared:` namespace

This page is the full reference. For a quick orientation, jump to [Quick Reference](#quick-reference) or [Examples](#examples).

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
       ┌─────────────────────────┴─────────────────────────┐
       │                                                   │
       ▼                                                   ▼
  CodeActExecutor                           ParallelTaskExecutor
  (writes step:, task: on finish-task       (passes task.dependsOn IDs as
   steps; auto-attaches list_shared /        upstream key hints to
   read_shared / share_result tools)         TaskExecutor)
```

Every executor writes results into `context.memory`. Every step has the three memory tools available automatically, and the system prompt instructs the model when to use them.

---

## Key Namespaces

| Namespace | Helper | Written By | Used For |
|---|---|---|---|
| `step:<id>` | `memoryKeys.step(id)` | `CodeActExecutor`, `TaskExecutor` (terminal step failure) | Per-step results |
| `task:<id>` | `memoryKeys.task(id)` | `CodeActExecutor` (finish-task steps), `ParallelTaskExecutor` | Per-task results |
| `input:<key>` | `memoryKeys.input(key)` | `TaskExecutor`, `ParallelTaskExecutor` | Caller-supplied inputs |
| `shared:<key>` | `memoryKeys.shared(key)` | `share_result` tool | Cross-agent communication, scratch space |

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
  /** Optional human-readable title shown in `list_shared`. */
  title?: string;
  /** Optional brief description. */
  description?: string;
  /** Wall-clock ms when the entry was first written. */
  createdAt: number;
}
```

`title` and `description` flow through to `list_shared` output, so set them when you want the LLM to see a friendly label rather than a UUID.

---

## Memory Tools (the LLM-facing API)

Three tools are auto-attached to every step executor. Their signatures appear in the prompt's tool catalog, so the model knows when to call them.

### `list_shared`

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

### `read_shared`

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

### `share_result`

Publish a value under the `shared:` namespace so other agents and steps can discover it via `list_shared`.

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

UIs can use this to render a live memory side panel.

### Clearing

```ts
context.memory.clear();                          // wipe everything
context.memory.clear({ kind: "step_result" });   // selective
context.memory.clear({ keyPrefix: "input:" });   // by prefix
```

---

## How Each Agent Type Uses Memory

### CodeActExecutor (`packages/agents/src/codeact/codeact-executor.ts`)

The execution engine for a single step.

**Writes**:

| Trigger | Key | Kind |
|---|---|---|
| Always | `step:<step.id>` | `step_result` |
| Last step of a task (finish-task) | `task:<task.id>` | `task_result` |
| Step exhausted iterations | `step:<step.id>` (with `{ error }`) | `step_result` |

**LLM access**:

- The memory tools ride in the toolbelt like any other, but the object model is their one documented form: the prompt teaches `nodetool.shared.list()` / `nodetool.shared.read(keys)` / `nodetool.shared.publish(key, value)`, and the three wire names drop out of the raw tool catalog like every other wrapped tool.
- The user message includes only **specific declared upstream keys** as a hint:
  - `step:<id>` for every entry of the step's `dependsOn` (intra-task deps).
  - any key supplied via `CodeActExecutorOptions.upstreamMemoryKeys` (typically `task:<id>` from the parent task's `dependsOn`).
- Values are not included; the agent calls `read_shared` to fetch them.

**Tool attachment**: `getMemoryTools()` — a belt built from the `shared` capability module's specs — is auto-pushed into the step's tool list at construction time, alongside any caller-supplied tools. Mount policy stays with the executor: the host never mounts these. Completion is `finish(result)` in the sandbox, validated host-side against the step's schema.

**Custom prompts are preambles, not replacements**: A caller-supplied `systemPrompt` is layered before the default execution prompt, so the contract — including the tool catalog and the `finish()` discipline — is non-bypassable.

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

The only `step:` key it writes itself is a terminal failure: `failStepEvents` records `{ error }` under `memoryKeys.step(step.id)` so the parent can read the reason. Every successful step result is written by the `CodeActExecutor` running it.

`TaskExecutor` accepts an optional `upstreamMemoryKeys` array (e.g. `task:<id>` keys from the parent plan). It forwards this verbatim to every step executor it creates.

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

Downstream tasks see their declared upstream task keys as hints in the step user message and pull values via `read_shared` when needed.

### The calling loop (`execute_plan`'s caller)

There is no synthesis stage that reads memory on the run's behalf. When
`execute_plan` returns, each task's value is in `context.memory` under
`task:<id>` and in the call's own `results` object; the CodeAct session that
made the call writes the answer on its next turn, calling `read_shared` for
anything the return did not carry. That is what `execute_plan`'s description
tells the model to do, and it is why the planner is told not to plan an
assembly task.

---

## Propagation Flow

This is the canonical end-to-end flow for a multi-task plan:

```
1. Caller: execute_plan(plan)
2. ParallelTaskExecutor.execute()
   ├─ Seed inputs:  context.memory.set({ kind: "input", ... })
   └─ For each executable task:
      └─ TaskExecutor.executeTasks()
         └─ For each step:
            └─ CodeActExecutor.execute()
               ├─ buildSystemPrompt() → default execution prompt
               │     (includes "Memory Tools" section)
               ├─ buildUserMessage() → instructions
               │     + "Required upstream memory" hint listing
               │       declared dependency keys (no values)
               ├─ LLM streams → may emit:
               │     - list_shared  → returns metadata
               │     - read_shared  → returns values for chosen keys
               │     - share_result → publishes shared facts
               │     - other tools / finish_step
               ├─ finish_step received → storeCompletionResult()
               │     ├─ context.memory.set({ key: "step:<id>", ... })
               │     └─ if useFinishTask:
               │         context.memory.set({ key: "task:<id>", ... })
               └─ yield step_result
3. ParallelTaskExecutor: ensure task: entry exists (idempotent)
4. Mark task.completed = true → unblocks downstream tasks
5. Next iteration: downstream tasks now executable. Their step user
   messages name the upstream task keys; agents call read_shared when
   they actually need the values.
6. execute_plan returns the task results; the calling session's next turn
   reads task:<id> via read_shared for anything it still needs and writes
   the answer.
```

---

## Examples

### Inspect memory at the end of a run

```ts
import { memoryKeys } from "@nodetool-ai/runtime";

// After the turn that called execute_plan has finished:
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
  1. Call `list_shared` to see what's available (returns metadata only —
     keys, titles, kinds, byte sizes).
  2. Call `read_shared` with the specific keys you actually need; it returns
     full values.
  3. Call `share_result` to publish a value under `shared:<key>` so other
     agents can find it via `list_shared`.
- Pull only what you need — don't fetch every entry by reflex.
```

And the user message for a step that depends on `task:research_phase` looks like:

```markdown
Write a report from the upstream findings.

# Required upstream memory (call `read_shared` with these keys):
- task:research_phase — Research findings
```

The model then chooses whether to call `read_shared` or proceed.

### Pre-populate memory before running

Useful in tests, and for handing a run what an earlier one already found:

```ts
context.memory.set({
  key: memoryKeys.task("prior_research"),
  kind: "task_result",
  value: cachedFindings,
  source: "prior_research",
  title: "Cached prior research",
  description: "Findings from a previous run; reuse instead of re-researching."
});
```

The first `list_shared` call in any step under this context surfaces the entry,
and `read_shared` fetches it.

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

Subsequent agents will see this via `list_shared` and can fetch it via `read_shared`.

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
| `list_shared` | Discover entries (metadata only) | `{ total, returned, entries: [...] }` |
| `read_shared` | Fetch full values for specific keys | `{ entries: { ... }, missing: [...] }` |
| `share_result` | Publish under `shared:<key>` | `{ ok, key, kind, createdAt }` |

---

## Design Decisions

**Why progressive disclosure and not auto-injection?**
Auto-injecting every memory entry into every prompt is wasteful. Most steps need one or two specific upstream values; dumping all of them costs tokens and pollutes attention. Progressive disclosure mirrors how a human researcher works: scan the index, fetch the specific document, ignore the rest.

**Why expose memory through tools instead of a dedicated channel?**
Models in 2026 are excellent tool callers — and tools come with rich JSON schemas that make discovery, filtering, and parameter validation trivial. Adding bespoke prompt syntax for memory access would be reinventing function calling. Tools also give us first-class observability: every memory access shows up as a `tool_call_update` in the message stream.

**Why is `share_result` restricted to `shared:`?**
Step results, task results, and inputs are owned by the executors. Letting an agent overwrite a `task:<id>` entry would let it spoof the result of work it didn't actually do, breaking the audit trail. Agents publish under `shared:` and the executor namespaces stay tamper-proof.

**Why does the user message still mention specific upstream keys?**
A pure tool-only design would force the agent to call `list_shared` even when the planner already declared the dependency. That's an unnecessary round trip for a known-relevant key. The user message names exactly the keys the planner pinned (`step.dependsOn` plus parent-task `dependsOn`), so the agent can go straight to `read_shared` for declared deps and use `list_shared` only when it needs to discover beyond them.

**Why a single map and not a relational store?**
Agent runs are short-lived and the data is small (typically tens of entries). A `Map` plus structured rendering covers every observed use case without the operational cost of a database. Persistent storage belongs in the asset / vector layer.

**Why namespaced string keys instead of typed IDs?**
The LLM has to read keys back from the tool result and pass them to `read_shared`. Strings round-trip cleanly through prompts and logs without serialization games.

**Why isn't memory shared across `context.copy()`?**
Copies are designed for isolated sub-runs. If a sub-run should inherit memory, the caller can `set` entries from the parent before kicking it off. Default isolation is the safer choice.

**Why does `customPrompt` no longer replace the default execution prompt?**
Replacing it stripped the memory-tool documentation and the `finish_step` discipline. The fix layers any caller preamble before the default prompt rather than replacing it. The execution contract (memory tools, output schema, completion protocol, conclusion-stage rules) is now non-bypassable.

---

## Troubleshooting

**Symptom:** A downstream task's prompt shows the upstream key hint but the agent never calls `read_shared`.
- The model may have decided it doesn't need the value. If you know it should, make the user instructions more explicit ("read the upstream findings via read_shared before writing").
- Check the conclusion stage: if the step is at >90% token budget, only `finish_step` is allowed and `read_shared` is filtered out.

**Symptom:** Task result key is missing after the step yielded `step_result` with `is_task_result: true`.
- A step executor only writes `task:<id>` for steps where `useFinishTask === true`. That flag is set by `TaskExecutor.isFinishStep()` for the last step in the task. Steps in the middle of a task only write `step:<id>`.
- For belt-and-suspenders, `ParallelTaskExecutor` performs an idempotent task-result write after each task, falling back to the last step's value.

**Symptom:** Tests pass but memory entries seem stale across test runs.
- A new `AgentMemory` instance is constructed for every `ProcessingContext`. If you reuse a context across tests, call `context.memory.clear()` between them.

**Symptom:** Agent calls `list_shared` and gets `truncated: true`.
- The list response is hard-capped at 200 entries. If you need more, narrow the filter (`kind`, `key_prefix`, or `sources`) — or accept that for very long runs, only the most recent 200 are visible at once.

---

## Related

- [Chat & Agents](global-chat-agents.md) — agents overview
- `packages/runtime/src/agent-memory.ts` — `AgentMemory` implementation
- `packages/agents/src/capabilities/shared.ts` — `list_shared` / `read_shared` / `share_result` (the `shared` capability module; `packages/agents/src/tools/memory-tools.ts` is the belt executors mount them from)
- `packages/agents/tests/memory-propagation.test.ts` — end-to-end propagation tests including the tool round-trip
- `packages/agents/tests/memory-tools.test.ts` — unit tests for the memory tools
- `packages/runtime/tests/agent-memory.test.ts` — `AgentMemory` unit tests
