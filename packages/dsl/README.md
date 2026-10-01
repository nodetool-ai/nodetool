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
| `resolveConnection` | function | Normalize a handle or single-output node, return `undefined` for a literal |
| `NodeOptions` | type | Optional explicit node identity (`id`) |
| `workflow` | function | Build from terminals or a typed schema and symbolic callback |
| `t`, `choose`, `map`, `template` | helpers | Typed parameters, runtime branches, iteration, and symbolic text |
| `toKernelGraph` | function | Convert host workflow nodes to kernel descriptors |
| `run` | function | Execute a workflow and return its outputs |
| `workflowToDsl` | function | Generate DSL source from a workflow graph (used by `export-dsl`) |
| `OutputHandle`, `Connectable`, `SingleOutput` | type | Typed wiring between node outputs and inputs |
| `DslNode`, `Workflow`, `WorkflowNode`, `WorkflowEdge` | type | Graph value types |
| `RunOptions`, `WorkflowResult`, `SecretResolver` | type | Execution configuration and results |
| generated namespaces (`text`, `agents`, `geminiImage`, …) | module | Typed factories for every registered node, grouped by namespace |

## Usage

```ts
import { workflow, run, t, template } from "@nodetool-ai/dsl";

const greeter = workflow({ name: t.string() }, ({ name }) => ({
  greeting: template`Hello ${name}!`
}));
const result = await run(greeter, { params: { name: "Ada" } });
// { greeting: "Hello Ada!" }
```

`createNode(nodeType, inputs, opts)` is the low-level primitive behind the generated factories; `opts` covers `id`, `streaming`, `multiOutput`, `outputNames`, and `defaultOutput`. A single-output node can be passed directly as an input. Explicit `node.output()` syntax remains supported. Select multi-output slots with `node.output("slot")`, `node.outputs.slot`, or a safe named property such as `node.if_true`. Generated factories accept an optional second argument: `text.concat({ a: greeting, b: "!" }, { id: "joined" })`. Duplicate IDs in a build fail. Graphs with Python nodes connect a worker bridge automatically (via `RunOptions.bridgeOptions` or the `NODETOOL_WORKER_URL` environment).

Regenerate the node factories after node changes:

```bash
npm run codegen         # rewrite both generated trees from the node registry
npm run codegen:check   # exit 1 when either tree no longer matches it
```

`codegen:check` runs in CI, so a node that is renamed or deleted cannot leave a
factory behind in the DSL. Pass `--graph` or `--flow` to work on one tree.

## Native flow (internal)

`src/flow/` calls a node as an async function — registry resolve, secret
injection, `process()`, outputs — with no graph and no `WorkflowRunner`. It is
**not** exported from this package. The public surface is the sandbox pack
`@nodetool-ai/sandbox-flow`, whose guest modules are generated into
`src/flow/generated/` by the same codegen pass and reach this code through the
`@nodetool-ai/sandbox-nodetool/flow` capability module. Two files here are
guest-only: `src/flow/guest-core.ts` (the call bridge the generated modules
import) and the generated tree itself — the pack build transforms them to
JavaScript, and nothing on the host imports either.

See [docs/dsl-native-flow-design.md](../../docs/dsl-native-flow-design.md).

See the [DSL guide](../../docs/developer/ts-dsl-guide.md) for before/after examples and the [authoring design](../../docs/developer/ts-dsl-authoring-design.md) for scope and follow-up phases.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
