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

## Plan Approval Gate

`Agent` can pause after planning and present the plan for user approval before
executing it. Wire a callback either as the `requestPlanApproval` option or on
the ProcessingContext under `PLAN_APPROVAL_CONTEXT_KEY` (the websocket runner
sets the context variable for chat-triggered runs, so Agent nodes in plan mode
gate without explicit wiring):

```typescript
const agent = new Agent({
  ...,
  requestPlanApproval: async (plan) =>
    userSaysYes(plan) ? { decision: "approve" } : { decision: "reject", feedback: "..." }
});
```

- **approve** — execution proceeds.
- **reject with feedback** — the planner re-runs with the feedback appended to
  the objective (bounded by `MAX_PLAN_REVISIONS`, 3) and the revised plan is
  presented again.
- **reject without feedback** — the run ends; `getResults()` returns a
  rejection notice.

The gate emits `planning_update` events with phase `awaiting_approval`
(status Running/Success/Failed) and `revision` so UIs can show state. Over the
websocket this round-trips as `plan_approval_request` / `plan_approval_response`
messages; the web chat renders a `PlanApprovalCard` with approve/reject and a
feedback field. Without a callback, planning flows straight into execution as
before. Tests: `packages/agents/tests/plan-approval.test.ts`.

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

## Script Mode (code-shaped orchestration)

The third planning mode next to `TaskPlan` and the graph planner: the LLM
authors a JavaScript *orchestration script* (`ScriptPlanner`), and
`ScriptRunner` executes it in the QuickJS sandbox. Every `agent()` call in the
script runs a real `StepExecutor` sub-agent on the host. A script expresses
what a static DAG cannot — loops until a condition holds, budget-scaled
fan-out, dedup between rounds, early exit.

```typescript
const agent = new Agent({
  name: "researcher",
  objective: "Find and verify 5 claims about X",
  provider, model,
  useScriptPlanner: true,          // LLM writes the script
  // script: "...",                // or supply one directly (skips planning)
  maxConcurrentAgents: 8,          // semaphore over concurrent agent() calls
  maxAgentCalls: 100               // lifetime cap per run
});
```

Guest API (see `SCRIPT_PRELUDE` in `script-runner.ts`):

| Primitive | Behavior |
|---|---|
| `await agent(prompt, opts?)` | Run a sub-agent. `opts.schema` → structured result via `finish_step`; `opts.tools` restricts the toolset; `opts.label` names progress events. Throws on failure. |
| `await parallel(thunks)` | Concurrent thunks; a failure resolves to `null` instead of rejecting the batch. |
| `await pipeline(items, ...stages)` | Each item flows through all stages independently (no barrier). Stages receive `(prev, originalItem, index)`. |
| `log(message)` | Emits a `log_update` to the host event stream. |
| `budget` | `maxAgentCalls`, `agentCalls()`, `remainingCalls()`, `await spentUsd()`. |
| `inputs` | Caller-supplied inputs object. |

The script's `return` value becomes `agent.getResults()`. Sub-agents share
`context.memory` as usual, and concurrency is bounded host-side by a semaphore
(`maxConcurrentAgents`, default 8) plus a lifetime call cap (`maxAgentCalls`,
default 100) — calls past the cap fail with a budget error the script can
handle (`budget.remainingCalls()` guards loops). Script failures (syntax
error, uncaught exception, wall-clock timeout — default 60 min including
sub-agent time) throw from `Agent.execute`.

Host bridges never reject (the QuickJS handle-leak rule from
`js-sandbox.ts` applies): `__runAgent` resolves `{ok, result|error}` envelopes
and the guest `agent()` re-throws.

Tests: `tests/script-runner.test.ts`, `tests/script-planner.test.ts`,
`tests/agent-script-mode.test.ts`.

## Graph Mode (one-shot DSL planning)

`GraphPlanner` builds a workflow graph by having the LLM write ONE graph DSL
program instead of a tool call per node/edge. Discovery tools (`search_nodes`,
`get_node_info`, `list_nodes`, `find_model`) stay; construction goes through a
single `submit_graph(code)` tool. The program is plain JavaScript with the
same wiring semantics as `@nodetool-ai/dsl` — `node(type, properties)` creates
a node, passing `ref.output(slot?)` as a property value becomes an edge, and
the program ends with `return graph();`:

```js
const prompt = node("nodetool.input.StringInput", { name: "prompt" });
const image = node("nodetool.image.TextToImage", {
  prompt: prompt.output(),
  model: { provider: "fal_ai", id: "fal-ai/flux/schnell" }
});
node("nodetool.output.ImageOutput", { name: "image", value: image.output() });
return graph();
```

The program runs in the QuickJS sandbox (`evaluateGraphDsl` in
`src/graph-dsl.ts` — no host access), is loaded into a `GraphBuilder`, and
validated structurally plus with node-sdk's `validateGraph`. Failures return
as the `submit_graph` tool result, so the model fixes the program and
resubmits over feedback rounds; an accepted submission ends the loop. The
outer retry (`maxRetries`, default 3) carries the last program and its errors
into a fresh attempt when the model stops without an accepted graph.

Tests: `tests/graph-dsl.test.ts`, `tests/graph-planner-coverage.test.ts`,
`tests/graph-planner-loop.test.ts`.

### Eval suite

`src/evals/` carries a provider-agnostic evaluation harness for the planner:
`GRAPH_PLANNER_EVAL_CASES` (objectives + structural expectations — input
wiring, node-family patterns, branch handles, no provider-locked nodes) and
`runGraphPlannerEval` (metrics per case: accepted, score, submit rounds,
tool calls, attempts, duration, cost; aggregate: success rate, one-shot rate,
averages). Run it against any registered provider:

```bash
npm run dev:nodetool -- eval graph-planner --list
npm run dev:nodetool -- eval graph-planner -p anthropic -m claude-sonnet-4-6
npm run dev:nodetool -- eval graph-planner -p ollama -m qwen-3.5:4b --cases summarize
npm run dev:nodetool -- eval graph-planner -p openai -m gpt-5.4-mini --json --out report.json
npm run dev:nodetool -- eval graph-planner -p anthropic -m ... --min-success 0.8  # CI gate
```

Harness tests (scripted provider, no network): `tests/graph-planner-eval.test.ts`.

### Tool-loop eval suites (frontend `ui_*` surfaces)

Where the graph-planner eval measures one-shot DSL authoring, the tool-loop
harness measures the incremental, multi-turn tool-calling flow the browser UI
and the agent WebSocket bridge actually expose. A real provider is handed the
frontend tool contract (names/descriptions/Zod schemas mirrored from
`web/src/lib/tools/builtin/*`) and drives it against a **headless bridge** —
a node-side fake that holds the same state shape and applies the same
mutations, with no browser. `runToolLoopEval` (`src/evals/tool-loop-eval.ts`)
is generic over the surface: a case supplies a `createBridge` factory
(`HeadlessSurfaceBridge<TFinal>` — `{ tools, finalState }`) plus structural
expectations, and the runner reports the same metrics as graph-planner
(accepted, score, tool calls, duration, cost). Scoring is structural
(`checkToolLoopExpectations`: required/forbidden tools, ordering, final-state
predicates, tool-call budgets, no-error-results) — never an exact transcript,
so many valid tool orderings pass.

Six suites are registered, one per surface:

| Suite | Tools | Bridge (`src/evals/`) |
|---|---|---|
| `tool-loop` | `ui_*` graph editor | `tool-loop-bridge.ts` |
| `script-tools` | `ui_script_*` | `surfaces/script.ts` |
| `sketch-tools` | `ui_sketch_*` | `surfaces/sketch.ts` |
| `timeline-tools` | `ui_timeline_*` | `surfaces/timeline.ts` |
| `storyboard-tools` | `ui_storyboard_*` | `surfaces/storyboard.ts` |
| `model3d-tools` | `ui_3d_*` | `surfaces/model3d.ts` |

Bridges reuse the pure packages where the real logic already lives —
`@nodetool-ai/timeline` (`splitClip`, `ANIMATION_PRESETS`, subtitle assembly,
clip/track factories), `@nodetool-ai/image-editor` — rather than reimplement.
Browser-only tools (image/asset capture, WebGL viewport render) are scoped out:
`ui_sketch_get_layer_image`, `ui_sketch_render_to_asset`,
`ui_timeline_get_clip_frames`, `ui_3d_capture_view`. Storyboard cannot import
`@nodetool-ai/llm-nodes` (it depends on `@nodetool-ai/agents`), so its
generate/render jobs are faked by flipping shot status.

```bash
npm run dev:nodetool -- eval timeline-tools --list
npm run dev:nodetool -- eval script-tools -p anthropic -m claude-sonnet-4-6
npm run dev:nodetool -- eval sketch-tools -p ollama -m qwen-3.5:4b --cases compose-layers
npm run dev:nodetool -- eval model3d-tools -p openai -m gpt-5.4-mini --min-success 0.8  # CI gate
```

Harness tests (scripted provider, no network): `tests/tool-loop-eval.test.ts`
plus one per surface (`tests/{script,sketch,timeline,storyboard,model3d}-tool-loop.test.ts`).
A live check against a local Ollama model runs when a daemon is reachable:
`tests/tool-loop-eval.ollama.test.ts`.

**Running against the `claude_agent_sdk` provider.** Two gotchas, both from the
SDK's own agent loop (not the harness):

- **Turn cap throws.** The SDK raises `error_max_turns` when it reaches its turn
  limit, so a run that would merely *stop* under a stateless provider (Anthropic,
  Ollama) instead errors and the case scores `accepted=false`. Its turn
  accounting also counts each tool round, so the default `--max-iterations 12`
  is easily exhausted by an over-searching model. Pass a higher cap
  (`--max-iterations 40`) when driving these suites with `claude_agent_sdk`.
- **`uid=0` refusal.** The tool path runs the CLI under `bypassPermissions`, which
  it refuses as root; set `IS_SANDBOX=1` (or run non-root). See
  [docs/AGENTS.md § Claude Agent SDK](../../docs/AGENTS.md) for the full
  nested-session recipe.

```bash
IS_SANDBOX=1 npm run dev:nodetool -- eval timeline-tools \
  -p claude_agent_sdk -m sonnet --max-iterations 40 --no-find-model
```

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
- `gen_ai.*` (OTel GenAI semconv): `gen_ai.system`, `gen_ai.request.model`, `gen_ai.operation.name`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.usage.total_tokens`, `gen_ai.usage.cost_usd`
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

### Tool Result Truncation

- Tool results are truncated to 20,000 chars (`MAX_TOOL_RESULT_CHARS`) before being added to history.
- Step executors delegate the tool-calling loop to `provider.generateLoop`, so each provider manages its own context window (the Claude Agent SDK compacts internally; stateless providers send the full transcript). There is no NodeTool-side per-step token budget, compaction, or eviction.

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

## Authoring Agent Nodes — Pitfalls

When building a node that wraps an agent (e.g. the `code-nodes` tool-agents, or
`llm-nodes` `AgentNode`):

- **Every tool named in an agent's system prompt must actually be registered in
  its toolset.** `BrowserAgent`/`HttpApiAgent` prompts instructed the model to call
  `browser`/`take_screenshot`/`http_request` tools that were never registered (only
  `execute_bash` was) — a prompt-referenced-but-unregistered tool is a silent
  no-op. Resolve real builtin tools (`resolveBuiltinAgentTool`) and don't reference
  tools you didn't wire.
- **Every declared prop must be consumed by `process()` or injected into the
  prompt.** A declared-but-unwired prop (`max_output_chars`, `url`, `output_dir`)
  does nothing — inject node props via a `promptContext()` hook.
- **`yield` structured results so the kernel routes them to dynamic output
  handles; don't `return` them from a generator** (`yield*` discards the return
  value). Keep structured-output emission consistent across modes (loop vs plan).
