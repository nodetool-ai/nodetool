# @nodetool-ai/agents

The planning agent system: `TaskPlanner` → `TaskExecutor` → `StepExecutor`,
plus `SimpleAgent`, the parallel task executor, skills, and agent tools.

## Responsibilities

- Decompose an objective into a DAG of tasks/steps and execute them (parallel
  where dependencies allow).
- Tool integration and progressive-disclosure memory tools (`memory_list`,
  `memory_read`, `memory_write`).

## Usage

```ts
import { Agent } from "@nodetool-ai/agents";

const agent = new Agent({ name, objective, provider, model, tools });
for await (const msg of agent.execute(ctx)) { /* … */ }
```

## Develop

```bash
npm run build --workspace=packages/agents
npm run test  --workspace=packages/agents
npm run lint  --workspace=packages/agents
```

Architecture, parallel execution, skills, and tuning: [packages/agents/CLAUDE.md](./CLAUDE.md).
