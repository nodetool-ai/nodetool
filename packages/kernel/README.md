# @nodetool-ai/kernel

The workflow kernel: the `Graph` model, `NodeInbox`, the actor runtime, and
`WorkflowRunner`. Executes a workflow graph via message-passing between node
actors. The graph is acyclic except for loops that close on a `Loop` node.

## Responsibilities

- `Graph` — structural model + validation (edge endpoints, types, source handles).
- `NodeActor` / `NodeInbox` — correlation-aware, buffered scheduling.
- `WorkflowRunner` — drives a run, emits `ProcessingMessage`s, collects outputs.

## Untaken branches

A node wired to data inputs that receives nothing on any of them does not run.
Its upstreams closed without emitting — an `If` emits only the taken handle, a
filter can emit nothing — so the node is on a branch nobody took. Skipping it
closes its own outputs with nothing, which cascades down the untaken subgraph.

Partial input still fires: a node that got a value on one handle and nothing on
another runs, with the declared default filling in the empty handle.

## Loops

A cycle is valid only when it closes on the `next` or `condition` input of a
`nodetool.control.Loop` node. Correlation analysis leaves those back edges out
of the topological order and gives the loop body its own iteration scope. The
Loop runs in its own actor mode (`src/loop.ts`) and closes its iteration
outputs itself, because the body's EOS cannot reach it first. For graphs with
a Loop, the runner reports a quiescent graph (every actor parked on its inbox)
so a Loop can end runs whose body stopped feeding back. Design:
[docs/workflow-loops.md](../../docs/workflow-loops.md).

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

Scheduling design: [docs/correlation-design.md](../../docs/correlation-design.md).
