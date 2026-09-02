# @nodetool-ai/agents

The planning agent system: `TaskPlanner` → `ParallelTaskExecutor` →
`TaskExecutor` → `CodeActExecutor`, plus skills and agent capabilities.

## Responsibilities

- Decompose an objective into a DAG of tasks/steps and execute them (parallel
  where dependencies allow).
- Tool integration and progressive-disclosure memory tools (`list_shared`,
  `read_shared`, `share_result`).

## Usage

```ts
import { createChatCodeActSession } from "@nodetool-ai/agents";

const session = createChatCodeActSession({
  tools: belt,                        // ToolSignatureSource[]
  executeTool: (call) => router(call), // the gated tool router
  signal: abortController.signal
});
// `session.systemPrompt` goes in the system message; `session.tools` are what
// the provider is offered. Run them through the host's own generateLoop.
```

## Develop

```bash
npm run build --workspace=packages/agents
npm run test  --workspace=packages/agents
npm run lint  --workspace=packages/agents
```

Architecture, parallel execution, skills, and tuning: [packages/agents/AGENTS.md](./AGENTS.md).
