# Observing LLM Steps and Planning

**Navigation**: [Agents package rules](../AGENTS.md) → **Observing LLM Steps and Planning**

Paths are relative to `packages/agents/` unless they name another package.

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
│  ├─ ✓ web_search(query: "AI trends")
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
      agent.plan        (TaskPlanner.planMultiTask / authorGraph)
        llm.chat        (BaseProvider.generateMessageTraced)
        llm.stream      (BaseProvider.generateMessagesTraced)
      agent.step        (CodeActExecutor.execute)
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
nodetool-chat --trace-file trace.jsonl
nodetool-chat --trace-stdout pretty
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
