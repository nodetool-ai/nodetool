# @nodetool-ai/dsl

Type-safe TypeScript DSL for defining [NodeTool](https://nodetool.ai) workflows.

Build a workflow graph in code — nodes, edges, and typed output handles — then run it or export it. Node factories are generated from the registry, so connections are checked at compile time.

## Install

```bash
npm install @nodetool-ai/dsl
```

## Exported symbols

| Symbol | Kind | Description |
|---|---|---|
| `createNode` | function | Create a graph node from a node type, inputs, and options |
| `workflow` | function | Assemble a `Workflow` from terminal (output) nodes |
| `run` | function | Execute a workflow and return its outputs |
| `workflowToDsl` | function | Generate DSL source from a workflow graph (used by `export-dsl`) |
| `OutputHandle`, `Connectable`, `SingleOutput` | type | Typed wiring between node outputs and inputs |
| `DslNode`, `Workflow`, `WorkflowNode`, `WorkflowEdge` | type | Graph value types |
| `RunOptions`, `WorkflowResult`, `SecretResolver` | type | Execution configuration and results |
| generated namespaces (`text`, `agents`, `geminiImage`, …) | module | Typed factories for every registered node, grouped by namespace |

## Usage

```ts
import { workflow, run, text } from "@nodetool-ai/dsl";
import { getSecret } from "@nodetool-ai/models";

const chunks = text.chunk({ text: "...long document...", length: 1000, overlap: 200 });

const wf = workflow(chunks);
const result = await run(wf, {
  secretResolver: (key, userId) => getSecret(key, userId)
});
console.log(result); // { output: string[] }
```

`createNode(nodeType, inputs, opts)` is the low-level primitive behind the generated factories; `opts` covers `streaming`, `multiOutput`, `outputNames`, and `defaultOutput`. Pass an output handle (`node.output()`) as another node's input to wire an edge. Graphs with Python nodes connect a worker bridge automatically (via `RunOptions.bridgeOptions` or the `NODETOOL_WORKER_URL` environment).

Regenerate the node factories after node changes:

```bash
npm run codegen
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
