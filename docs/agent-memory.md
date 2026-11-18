---
layout: page
title: "Agent Memory System"
permalink: /agent-memory
description: "Unified, structured memory shared by every agent, task, and step in NodeTool — accessed via tool calls with progressive disclosure."
---

**Navigation**: [Chat & Agents](global-chat-agents.md) → **Agent Memory**

> For notes an agent saves across conversations, see [Memory](memory.md). This page covers only the per-run store.

`context.memory` is a key-value store on every `ProcessingContext`. Executors write step and task results into it, and agents read it through three tools. This is what `list_shared` returns mid-run:

```jsonc
{
  "total": 2, "returned": 2, "truncated": false,
  "entries": [
    { "key": "task:research", "kind": "task_result", "title": "Research findings",
      "source": "research", "valueBytes": 142, "createdAt": "2026-05-07T14:00:01.234Z" },
    { "key": "shared:top_source", "kind": "shared", "title": "Top source URL",
      "source": "share_result", "valueBytes": 19, "createdAt": "2026-05-07T14:00:03.020Z" }
  ]
}
```

The store lives for one run. It is cleared when the run ends and is not shown on the Memory page.

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

Every step has `list_shared`, `read_shared`, and `share_result` attached automatically. The step prompt does not include memory contents, only the keys declared through `task.dependsOn` or `step.dependsOn`.

---

## Key Namespaces

| Namespace | Helper | Written By | Used For |
|---|---|---|---|
| `step:<id>` | `memoryKeys.step(id)` | `CodeActExecutor`, `TaskExecutor` (terminal step failure) | Per-step results |
| `task:<id>` | `memoryKeys.task(id)` | `CodeActExecutor` (finish-task steps), `ParallelTaskExecutor` | Per-task results |
| `input:<key>` | `memoryKeys.input(key)` | `TaskExecutor`, `ParallelTaskExecutor` | Caller-supplied inputs |
| `shared:<key>` | `memoryKeys.shared(key)` | `share_result` tool | Cross-agent communication, scratch space |

Build keys with the `memoryKeys` helpers from `@nodetool-ai/runtime`, for example `context.memory.has(memoryKeys.task("research_phase"))`.

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

---

## Memory Tools (the LLM-facing API)

Inside a CodeAct step the model calls `nodetool.shared.list(opts)`, `nodetool.shared.read(keys)`, and `nodetool.shared.publish(key, value, opts)` (`opts` carries `title` and `description`). The wire names below are what tool calls and the supervisor's `StepExecutor` use.

### `list_shared`

Returns metadata only.

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

`valueBytes` is the character length of the value (the string itself, or its JSON serialization). The model can use it to budget reads. Each `description` is cut at 240 characters with a trailing `…`. The result is capped at 200 entries, the first 200 in insertion order, and `truncated: true` reports that more exist. `createdAt` is an ISO timestamp here.

### `read_shared`

Returns full values for the keys given.

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

Missing keys come back in `missing`. A key with no `:` is retried under `shared:`, so the suffix given to `share_result` reads back as written. Each entry is the full `MemoryEntry`, so `createdAt` is a millisecond number here.

### `share_result`

Publishes a value under `shared:`.

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

A key that already starts with `shared:` has the prefix stripped, so writing back a key from `list_shared` does not produce `shared:shared:<key>`. `title` defaults to the key suffix, and `source` is always `share_result`. Writes are limited to `shared:`, so an agent cannot overwrite step, task, or input results.

---

## Direct API Reference

`AgentMemory` lives in `packages/runtime/src/agent-memory.ts` and is exported from `@nodetool-ai/runtime`. Executors use it directly. Agents reach it through the three tools.

Other methods: `delete(key)` returns whether the key existed, `size()` returns the entry count, and `formatForPrompt(filter?)` renders matching entries as a Markdown block ordered by `createdAt` (empty string when none match).

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

### Snapshot and restore

```ts
const saved = context.memory.snapshot();   // MemoryEntry[] in insertion order
context.memory.restore(saved);             // rewrites each entry, keeps createdAt, notifies subscribers
```

`restore` on a fresh `AgentMemory` rebuilds it. Existing keys are overwritten.

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
| Step failed (error, budget stop, iterations exhausted, or no `finish()`) | `step:<step.id>` (with `{ error }`, title `Failed: <instructions>`) | `step_result` |

**LLM access**:

- The memory tools ride in the toolbelt like any other, but the object model is their one documented form: the prompt teaches `nodetool.shared.list()` / `nodetool.shared.read(keys)` / `nodetool.shared.publish(key, value)`, and the three wire names drop out of the raw tool catalog like every other wrapped tool.
- The user message includes only **specific declared upstream keys** as a hint, under the heading "Required upstream context — read these before acting (via `await nodetool.shared.read([...])`)":
  - `step:<id>` for every entry of the step's `dependsOn` (intra-task deps).
  - any key supplied via `CodeActExecutorOptions.upstreamMemoryKeys` (typically `task:<id>` from the parent task's `dependsOn`).
- Values are not included, and the keys are listed whether or not they exist yet. The agent calls `nodetool.shared.read` to fetch them.

**Tool attachment**: `getSharedTools()` (`packages/agents/src/tools/shared-tools.ts`) — a belt built from the `shared` capability module's specs — is auto-pushed into the step's tool list at construction time, alongside any caller-supplied tools. Mount policy stays with the executor: the host never mounts these. Completion is `finish(result)` in the sandbox, validated host-side against the step's schema.

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

Keys already seeded by `ParallelTaskExecutor` are skipped. Each step runs on a copy of the context that shares the task's memory (`context.copy({ shareMemory: true })`). The only `step:` key it writes itself is a terminal failure: `failStepEvents` records `{ error }` under `memoryKeys.step(step.id)` so the parent can read the reason. Every successful step result is written by the `CodeActExecutor` running it.

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

### StepExecutor (`packages/agents/src/step-executor.ts`)

The step executor of the supervisor agent and the app-build harness, not of `execute_plan`. It attaches the same three tools. Its system prompt has a "Memory Tools (progressive disclosure)" section that names `list_shared`, `read_shared`, and `share_result` directly. Its user message lists declared upstream keys that exist in memory, with titles:

```markdown
# Required upstream memory (call `read_shared` with these keys):
- task:research_phase — Research findings
```

Steps finish through `finish_step`.

### The calling loop (`execute_plan`'s caller)

There is no synthesis stage. After `execute_plan` returns, the calling session writes the answer on its next turn and calls `read_shared` for anything the return did not carry. `execute_plan`'s description tells the model to do this, which is why the planner is told not to plan an assembly task.

---

## Propagation Flow

```
1. Caller: execute_plan(plan)
2. ParallelTaskExecutor.execute()
   ├─ Seed inputs:  context.memory.set({ kind: "input", ... })
   └─ For each executable task:
      └─ TaskExecutor.executeTasks()
         └─ For each step:
            └─ CodeActExecutor.execute()
               ├─ system prompt teaches nodetool.shared.*
               ├─ buildUserMessage() → instructions
               │     + "Required upstream context" hint listing
               │       declared dependency keys (no values)
               ├─ model writes actions that may call:
               │     - nodetool.shared.list    → returns metadata
               │     - nodetool.shared.read    → returns values for chosen keys
               │     - nodetool.shared.publish → publishes shared facts
               ├─ finish(result) accepted → storeCompletionResult()
               │     ├─ context.memory.set({ key: "step:<id>", ... })
               │     └─ if useFinishTask:
               │         context.memory.set({ key: "task:<id>", ... })
               └─ yield step_result
3. ParallelTaskExecutor: ensure task: entry exists (idempotent)
4. Mark task.completed = true → unblocks downstream tasks
5. Downstream tasks become executable. Their step user messages name the
   upstream task keys.
6. execute_plan returns the task results.
```

---

## Examples

### What the LLM sees (StepExecutor system prompt extract)

The `StepExecutor` default execution system prompt includes this block. A CodeAct step is taught the same operations as `nodetool.shared.list`, `read`, and `publish`.

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

## Design notes

- `context.copy()` does not share memory unless called with `shareMemory: true`, as `TaskExecutor` does. A sub-run that should inherit memory gets entries `set` from the parent first.

---

## Troubleshooting

**Symptom:** A downstream task's prompt shows the upstream key hint but the agent never reads it.
- The model may have decided it doesn't need the value. If you know it should, make the user instructions more explicit ("read the upstream findings via read_shared before writing").

**Symptom:** Task result key is missing after the step yielded `step_result` with `is_task_result: true`.
- A step executor only writes `task:<id>` for steps where `useFinishTask === true`. That flag is set by `TaskExecutor.isFinishStep()` for the last step in the task. Steps in the middle of a task only write `step:<id>`.
- For belt-and-suspenders, `ParallelTaskExecutor` performs an idempotent task-result write after each task, falling back to the last step's value.

**Symptom:** Tests pass but memory entries seem stale across test runs.
- A new `AgentMemory` instance is constructed for every `ProcessingContext`. If you reuse a context across tests, call `context.memory.clear()` between them.

---

## Related

- [Memory](memory.md): durable notes across conversations
- [Chat & Agents](global-chat-agents.md)
- `packages/runtime/src/agent-memory.ts` — `AgentMemory` implementation
- `packages/agents/src/capabilities/shared.ts` — `list_shared` / `read_shared` / `share_result` (the `shared` capability module; `packages/agents/src/tools/memory-tools.ts` is the belt executors mount them from)
- `packages/agents/tests/memory-propagation.test.ts` — end-to-end propagation tests including the tool round-trip
- `packages/agents/tests/memory-tools.test.ts` — unit tests for the memory tools
- `packages/runtime/tests/agent-memory.test.ts` — `AgentMemory` unit tests
