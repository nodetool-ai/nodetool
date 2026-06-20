# @nodetool-ai/kernel

The workflow kernel: the `Graph` model, `NodeInbox`, the actor runtime, and
`WorkflowRunner`. Executes a workflow DAG via message-passing between node
actors.

## Responsibilities

- `Graph` — structural model + validation (edge endpoints, types, source handles).
- `NodeActor` / `NodeInbox` — correlation-aware, buffered scheduling.
- `WorkflowRunner` — drives a run, emits `ProcessingMessage`s, collects outputs.

## Usage

```ts
import { WorkflowRunner } from "@nodetool-ai/kernel";

const runner = new WorkflowRunner("job-1", { resolveExecutor });
const result = await runner.run({ job_id: "job-1", params }, { nodes, edges });
```

## Develop

```bash
npm run build --workspace=packages/kernel
npm run test  --workspace=packages/kernel
npm run lint  --workspace=packages/kernel
```

Scheduling design and known gaps: [docs/correlation-design.md](../../docs/correlation-design.md)
and [docs/KERNEL_PARITY_GAPS.md](../../docs/KERNEL_PARITY_GAPS.md).
