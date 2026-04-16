# Agents Package

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
import { Agent } from "@nodetool/agents";
import { createRuntimeContext } from "@nodetool/runtime";

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

Every `generateMessagesTraced()` call creates an OpenTelemetry span with attributes: `llm.provider`, `llm.model`, `llm.request.message_count`, `llm.request.tools_count`, `llm.response.content`, `llm.response.tool_calls_count`.

```bash
# Console output (development)
export OTEL_TRACES_EXPORTER=console
export TRACELOOP_DISABLE_BATCH=true

# Traceloop cloud
export TRACELOOP_API_KEY=your-key

# Custom OTLP backend (Jaeger, Grafana, etc.)
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Telemetry must be initialized before use:

```typescript
import { initTelemetry } from "@nodetool/runtime";
await initTelemetry();
```

The CLI calls `initTelemetry()` at startup automatically. The WebSocket server requires env vars to be set before starting.

### Web UI

The web UI renders the same tree view in the chat panel (`ExecutionTree` component). The `TracePanel` provides a detailed event inspector with token counts, costs, and full request/response payloads.

## Evaluation and Optimization

### Cost Tracking

`CostCalculator` in `@nodetool/runtime` tracks per-call costs based on provider pricing:

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
- At 90% usage, enters "conclusion stage" — forces step completion
- Tool results truncated to 20,000 chars
- Older messages summarized to stay within limits
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
- Failed JSON parsing retried up to 6 times (`MAX_JSON_PARSE_FAILURES`)
- Warning after 3 failures (`JSON_FAILURE_ALERT_THRESHOLD`)

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
