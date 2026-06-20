# @nodetool-ai/runtime

Processing context, LLM providers, message queue, agent memory, output
normalization, and telemetry for the NodeTool runtime.

## Responsibilities

- `ProcessingContext` — the per-run context passed to every node/executor,
  including `context.memory` (`AgentMemory`).
- LLM providers in `src/providers/` (Anthropic, OpenAI, Gemini, Ollama, …) all
  extending `BaseProvider`.
- Output normalization, message queue, cost tracking, and OpenTelemetry tracing.

## Usage

```ts
import { createRuntimeContext, BaseProvider } from "@nodetool-ai/runtime";
```

## Develop

```bash
npm run build --workspace=packages/runtime
npm run test  --workspace=packages/runtime
npm run lint  --workspace=packages/runtime
```

See [packages/agents/CLAUDE.md](../agents/CLAUDE.md) for the agent-memory model
and the root [CLAUDE.md](../../CLAUDE.md) for provider/telemetry details.
