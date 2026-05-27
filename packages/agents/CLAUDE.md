# Agents Package

## Agent Memory (`@nodetool-ai/runtime` → `context.memory`)

Every `ProcessingContext` carries an `AgentMemory` instance at `context.memory`. It is the **single source of truth** for everything shared between steps, tasks, sub-agents, and tools. Do not introduce a parallel result map in any executor — read and write through `context.memory`.

### Access pattern: progressive disclosure via tools

Memory contents are NOT auto-injected into prompts. Agents access memory through three tools that are auto-attached to every step (and to every team iteration):

| Tool | Purpose |
|---|---|
| `memory_list` | Discover available entries (metadata only — keys, titles, kinds, byte sizes) |
| `memory_read` | Fetch full values for specific keys |
| `memory_write` | Publish a value under `shared:<key>` |

The default execution system prompt documents these tools. The user message names only **specific** upstream keys the planner pinned (`step.dependsOn` plus parent-task `dependsOn` via `upstreamMemoryKeys`) — values are pulled on demand.

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
| `StepExecutor` | Step completion | `step:<step.id>` | `step_result` |
| `StepExecutor` | Last step of a task (finish-task) | `task:<task.id>` | `task_result` |
| `TaskExecutor` | Startup / process-mode aggregation | `input:<key>` / `step:<step.id>` | `input` / `step_result` |
| `ParallelTaskExecutor` | After a task completes (idempotent) | `task:<task.id>` | `task_result` |
| `AgentStepExecutor` | Workflow edge inputs | `input:<nodeId>.<key>` | `input` |
| `memory_write` tool | Agent / sub-agent publish | `shared:<key>` | `shared` |

`memory_write` is restricted to the `shared:` namespace so agents can't spoof step / task / input results. Internal executors write directly through `context.memory.set` for their owned namespaces.

### Custom prompts are preambles, not replacements

`StepExecutor.buildSystemPrompt()` always uses the default execution prompt (memory tools docs, output schema, `finish_step` discipline). A caller-supplied `systemPrompt` is layered as a preamble *before* the default — it cannot override the execution contract. Earlier versions allowed this and broke result capture in plan mode.

### Final synthesis: CompilerAgent

`Agent` ends with a dedicated `CompilerAgent` pass after `ParallelTaskExecutor` finishes. The compiler reads the gathered memory snapshot, fetches values via `memory_read`, and produces the final deliverable:

- **Structured mode** (an `outputSchema` is set): `finish_step` is included in the toolset, and the compiler returns a schema-conformant value.
- **Prose mode** (no `outputSchema`): `finish_step` is omitted; the compiler emits a final assistant message and the absence of any tool call ends the loop. The text becomes the result.

The planner is told NOT to create an aggregation/synthesis step — final assembly is the compiler's job. There is no "schema grafted onto the last step" hack anymore.

### Threading task-level deps through executors

`ParallelTaskExecutor` derives `task.dependsOn.map(memoryKeys.task)` and forwards it as `upstreamMemoryKeys` to `TaskExecutor`, which forwards it verbatim to every `StepExecutor`. The step's user message renders these as `- task:<id>` hints next to the intra-task `step:<id>` deps. The agent calls `memory_read` when it needs the values.

### Tests

- `packages/runtime/tests/agent-memory.test.ts` — unit tests for `AgentMemory`
- `packages/agents/tests/memory-tools.test.ts` — unit tests for `memory_list` / `memory_read` / `memory_write`
- `packages/agents/tests/memory-propagation.test.ts` — end-to-end through `Agent`, including a fake-provider round trip that drives `memory_list` → `memory_read` → `finish_step`
- `packages/agents/tests/_helpers/mock-context.ts` — shared mock context with a real `AgentMemory` for executor tests

When asserting memory writes in tests, prefer `context.memory.has(memoryKeys.task("..."))` and `context.memory.subscribe(...)` over spies on `set` / `storeStepResult`.

For the full API reference, tool schemas, propagation flow, design decisions, and troubleshooting, see [docs/agent-memory.md](../../docs/agent-memory.md).

## JavaScript Sandbox (`src/js-sandbox.ts`)

User-authored JS from `MiniJSAgentTool` and `nodetool.code.Code` runs in a
**QuickJS WebAssembly sandbox** via `@sebastianwessel/quickjs`. The guest lives
in its own WASM heap, so runaway or malicious code can't corrupt the host V8
heap the way it could under the previous `node:vm` implementation.

Hard limits enforced by the runtime:

| Limit | Value | Configured by |
|-------|-------|---------------|
| Execution time | `timeoutMs` (default 30 s) | `setInterruptHandler` (CPU budget) + wall-clock race |
| Guest heap | `GUEST_MEMORY_LIMIT` = 64 MB | `runtime.setMemoryLimit` |
| Call stack | `GUEST_STACK_LIMIT` = 512 KB | `runtime.setMaxStackSize` |
| Fetch calls | `MAX_FETCH_CALLS` = 20 per run | counter inside bridge |
| Fetch body | `MAX_RESPONSE_BODY_SIZE` = 1 MB | truncation inside bridge |
| Output | `MAX_OUTPUT_SIZE` = 100 KB | `serializeResult` truncation |

Exposed guest surface: `console`, `fetch`, `uuid`, `sleep`, `getSecret`,
`workspace.{read,write,list}` (requires a `ProcessingContext`), and any
caller-supplied `globals`. `eval` and `Function` are deleted at init so the
user cannot re-enter dynamic code generation. Core JS (`JSON`, `Math`, `Date`,
`Map`, `URL`, `TextEncoder`, etc.) is QuickJS's native implementation, not a
host-bridged version.

**State sync-back**: object-typed globals are deep-replaced on the host after
the guest runs, so `CodeNode`'s `state` object persists across invocations.
Primitive globals pass by value (no sync).

**Known QuickJS limitations**:
- `url.searchParams.set(...)` doesn't propagate back to the parent URL. Build
  the query via `URLSearchParams` directly.
- Host async functions must never reject — `js-sandbox.ts` wraps them in a
  `neverReject` adapter that returns a tagged error object, which a guest
  prelude rewraps into a real `throw`. Working around a known handle leak in
  `@sebastianwessel/quickjs@3.0.1` (tracked as `list_empty(&rt->gc_obj_list)`
  assertion on runtime dispose).

## Running Agents from CLI

### Interactive Chat

```bash
# Start in agent mode
nodetool-chat --agent

# With specific provider and model
nodetool-chat --agent --provider anthropic --model claude-sonnet-4-6

# With workspace directory
nodetool-chat --agent --workspace /path/to/project

# Connect to WebSocket server
nodetool-chat --agent --url ws://localhost:7777/ws
```

### Piped Input

```bash
echo "Summarize this codebase" | nodetool-chat --agent --provider anthropic
```

### Interactive Commands

```
/agent    — Toggle agent mode on/off
/model    — Set model: /model claude-opus-4-6
/provider — Set provider: /provider openai
/tools    — List enabled tools
```

### Programmatic Usage

```typescript
import { Agent } from "@nodetool-ai/agents";
import { createRuntimeContext } from "@nodetool-ai/runtime";

const ctx = createRuntimeContext({ jobId: "...", userId: "1", workspaceDir: "." });

const agent = new Agent({
  name: "my-agent",
  objective: "Research and summarize AI trends",
  provider,          // BaseProvider instance
  model: "claude-sonnet-4-6",
  tools: [readFileTool, writeFileTool, searchTool],
  outputSchema: {    // Optional: structured output
    type: "object",
    properties: { summary: { type: "string" } },
    required: ["summary"]
  }
});

for await (const msg of agent.execute(ctx)) {
  // msg.type: "chunk" | "planning_update" | "task_update" | "tool_call_update" | "step_result" | "log_update"
}

const result = agent.getResults();
```

## Parallel Task Execution

The Agent class automatically decomposes objectives into parallel tasks via `TaskPlanner.planMultiTask()`. Tasks form a DAG — independent tasks run concurrently.

### How It Works

1. **Planning**: LLM generates a `TaskPlan` with multiple `Task` objects, each with `dependsOn` arrays
2. **Scheduling**: `ParallelTaskExecutor` finds tasks with satisfied dependencies and runs them concurrently
3. **Merging**: `mergeAsyncGenerators()` interleaves message streams from concurrent tasks
4. **Completion**: Results propagate to dependent tasks; cycle repeats until all tasks finish

### Task Plan Structure

```typescript
interface TaskPlan {
  title: string;
  tasks: Task[];           // Multiple tasks forming a DAG
}

interface Task {
  id: string;
  title: string;
  steps: Step[];
  dependsOn?: string[];    // Task IDs this depends on ([] = independent)
}

interface Step {
  id: string;
  instructions: string;
  dependsOn: string[];     // Step IDs within this task
  tools?: string[];        // Restrict available tools
  outputSchema?: string;   // JSON schema for step result
}
```

### Skipping Planning

Provide a pre-defined `task` to bypass the planning phase:

```typescript
const agent = new Agent({
  objective: "...",
  provider, model,
  task: {
    id: "my-task",
    title: "Direct task",
    steps: [
      { id: "s1", instructions: "Do X", dependsOn: [], completed: false, logs: [] },
      { id: "s2", instructions: "Do Y", dependsOn: ["s1"], completed: false, logs: [] }
    ]
  }
});
```

### Concurrency Defaults

| Constant | Default | Location |
|----------|---------|----------|
| `DEFAULT_MAX_TASK_ITERATIONS` | 100 | `parallel-task-executor.ts` |
| `DEFAULT_MAX_STEP_ITERATIONS` | 10 | `parallel-task-executor.ts` |
| `DEFAULT_MAX_STEPS` | 50 | `task-executor.ts` |
| `MAX_RETRIES` (planning) | 3 | `task-planner.ts` |

## Observing LLM Steps and Planning

### Execution Tree (CLI)

The CLI renders a real-time tree view during agent execution:

```
✓ initialization    Starting parallel task planning...
✓ generation        Generating parallel plan...
✗ validation        Plan validation failed: duplicate step IDs
✓ generation        Retry attempt 2/3...
✓ complete          Plan created: 5 tasks, 5 steps, 5 parallelizable

◆ Plan  (3/5 tasks)
├─ ✓ Task 1: Search sources            3.2s (1/1 steps)
├─ ◐ Task 2: Analyze findings
│  ├─ ✓ google_search(query: "AI trends")
│  └─ ◐ llm_call
└─ ○ Task 3: Write report              waiting
```

### Message Types

All execution events are yielded as `ProcessingMessage`:

| Type | Description |
|------|-------------|
| `planning_update` | Planning phase progress (initialization, generation, validation, complete) |
| `task_update` | Task lifecycle (task_created, step_started, step_completed, step_failed, task_completed) |
| `tool_call_update` | Tool invocation with name and args |
| `step_result` | Step completion with result or error |
| `chunk` | Streaming text output |
| `log_update` | Informational log messages |
| `llm_call` | Full LLM call details (provider, model, messages, response, tokens, cost, duration) |

### Debug Logging

```bash
# Verbose logging to stderr
export NODETOOL_LOG_LEVEL=debug

# Log to file
export NODETOOL_LOG_FILE=/tmp/agents.log
```

### OpenTelemetry Tracing

Span hierarchy (an analyzer agent can read this tree to optimize prompts):

```
workflow.run
  node.process
    agent.execute
      agent.plan        (TaskPlanner.planMultiTask / GraphPlanner.plan)
        llm.chat        (BaseProvider.generateMessageTraced)
        llm.stream      (BaseProvider.generateMessagesTraced)
      agent.step        (StepExecutor.execute)
        llm.chat
        llm.stream
```

Span attributes:

- `agent.*`: `agent.kind` (execute/plan/step), `agent.objective`, `agent.provider`, `agent.model`, `agent.tools_count`, `agent.task` (for steps), `agent.plan.kind` (multi/single/graph)
- `llm.*`: `llm.provider`, `llm.model`, `llm.request.message_count`, `llm.request.tools_count`, `llm.request.max_tokens`, `llm.request.stream`, `llm.response.content` (first 2000 chars), `llm.response.tool_calls_count`
- `gen_ai.*` (OTel GenAI semconv): `gen_ai.system`, `gen_ai.request.model`, `gen_ai.operation.name`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.total_tokens`, `gen_ai.usage.cost_credits`
- `workflow.*` / `node.*`: `workflow.id`, `workflow.name`, `workflow.node_count`, `node.id`, `node.type`

Sinks (simultaneous, each on its own SpanProcessor):

```bash
# JSONL trace file — one span per line, analyzer-friendly
export NODETOOL_TRACE_FILE=/tmp/nodetool-trace.jsonl

# Stdout — pretty (human) or json (JSONL)
export NODETOOL_TRACE_STDOUT=pretty       # or "json"

# OpenTelemetry — console (legacy)
export OTEL_TRACES_EXPORTER=console
export TRACELOOP_DISABLE_BATCH=true

# OpenTelemetry — Traceloop cloud
export TRACELOOP_API_KEY=your-key

# OpenTelemetry — custom OTLP backend (Jaeger, Grafana, etc.)
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

CLI flags pass these through:

```bash
nodetool-chat --agent --trace-file trace.jsonl
nodetool-chat --agent --trace-stdout pretty
nodetool --trace-file trace.jsonl run workflow.ts
```

Telemetry must be initialized before use:

```typescript
import { initTelemetry } from "@nodetool-ai/runtime";
await initTelemetry({
  traceFile: "trace.jsonl",   // optional
  stdout: "pretty",            // optional: "pretty" | "json" | false
});
```

The CLI calls `initTelemetry()` at startup automatically. The WebSocket server requires env vars to be set before starting.

### Web UI

The web UI renders the same tree view in the chat panel (`ExecutionTree` component). The `TracePanel` provides a detailed event inspector with token counts, costs, and full request/response payloads.

## Evaluation and Optimization

### Cost Tracking

`CostCalculator` in `@nodetool-ai/runtime` tracks per-call costs based on provider pricing:

```typescript
provider.trackUsage(model, { inputTokens: 100, outputTokens: 50 });
console.log(provider.getTotalCost()); // USD
```

Costs are logged via `logProviderCall()` and included in `llm_call` messages.

### Model Selection

Use separate models for planning vs execution to optimize cost/quality:

```typescript
const agent = new Agent({
  model: "claude-haiku-4-5",           // Fast/cheap for step execution
  planningModel: "claude-sonnet-4-6",  // Better for plan decomposition
  reasoningModel: "claude-opus-4-6",   // Best for complex reasoning
  ...
});
```

### Token Budgeting

- Default token limit: 128,000 per step
- At 90% usage, oldest tool-result messages are evicted from history (their values remain in `context.memory` and can be re-read via `memory_read`)
- Tool results truncated to 20,000 chars
- Configure via `maxTokenLimit` option

### Plan Validation

Plans are validated before execution:
- Step/task IDs must be unique across the entire plan
- Dependencies must reference valid IDs
- No circular dependencies (DAG validation via DFS)
- On failure, error is fed back to LLM for retry (up to `maxRetries`)

### Output Schema Validation

Steps can enforce structured output via JSON schema:
- `additionalProperties: false` enforced automatically
- Schema'd steps finalize ONLY through the `finish_step` tool — there is no JSON-from-text extraction path. If `finish_step` is never called, the step fails on `maxIterations` and emits an explicit error result.
- Unstructured steps (no schema) finalize when the model emits a no-tool-call assistant message; that text becomes the result.

### Skills System

Skills inject domain-specific instructions into the agent system prompt:

```
.claude/skills/my-skill/SKILL.md
~/.claude/skills/shared-skill/SKILL.md
```

Skill format:
```markdown
---
name: data-analysis
description: Analyze CSV datasets and produce summary statistics
---

When analyzing data:
1. Load the dataset using read_file
2. Identify column types
3. Compute summary statistics
```

Control via environment variables:
```bash
NODETOOL_AGENT_SKILL_DIRS=/path/to/skills   # Additional skill directories
NODETOOL_AGENT_SKILLS=skill-a,skill-b       # Explicitly enable skills
NODETOOL_AGENT_AUTO_SKILLS=0                # Disable auto-matching (default: enabled)
```

### Tuning Checklist

1. **Reduce cost**: Use cheaper `model` for execution, better `planningModel` for decomposition
2. **Improve plan quality**: Increase `maxRetries` on `TaskPlanner`, use custom `systemPrompt`
3. **Speed up execution**: Decompose into more independent tasks (maximizes parallelism)
4. **Control scope**: Set `maxSteps` and `maxStepIterations` to prevent runaway execution
5. **Validate output**: Use `outputSchema` to enforce structured results
6. **Restrict tools**: Per-step `tools` arrays limit which tools a step can call
7. **Observe**: Enable tracing (`OTEL_TRACES_EXPORTER=console`) to see every LLM call
8. **Iterate on skills**: Add domain-specific SKILL.md files to improve agent behavior
