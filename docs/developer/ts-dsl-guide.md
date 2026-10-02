---
layout: page
title: "TypeScript DSL Guide"
description: "Define NodeTool workflows programmatically using type-safe TypeScript factory functions."
---

The TypeScript DSL (`@nodetool-ai/dsl`) provides type-safe factory functions for building NodeTool workflows in code. Define workflows programmatically with full IDE autocompletion, then serialize them to the same JSON format used by the visual editor.

## Table of Contents

1. [Installation](#installation)
2. [Core Concepts](#core-concepts)
3. [Basic Workflow](#basic-workflow)
4. [Connecting Nodes](#connecting-nodes)
5. [Multi-Output Nodes](#multi-output-nodes)
6. [Typed workflows and composition](#typed-workflows-and-composition)
7. [Runtime branches, maps, and text](#runtime-branches-maps-and-text)
8. [Building the Workflow Graph](#building-the-workflow-graph)
9. [Namespaces](#namespaces)
10. [Code Generation](#code-generation)
11. [Best Practices](#best-practices)

---

## Installation

Install from npm:

```bash
npm install @nodetool-ai/dsl
```

Or inside the NodeTool monorepo, all workspace packages are available after `npm install` at the repo root.

Import namespaces directly:

```ts
import { constant, text, image } from "@nodetool-ai/dsl";
import { workflow } from "@nodetool-ai/dsl";
```

The package root is the only public entry point. `package.json` also exports `./flow`, but that is the internal native-flow backend, not a supported API (see the [native flow design](../dsl-native-flow-design.md)). A subpath import of a generated namespace file does not resolve.
Run `npm run codegen --workspace=packages/dsl` and read
`packages/dsl/src/generated/index.ts` for the namespace names this build ships.

---

## Core Concepts

### OutputHandle

When you create a node, you get back a `DslNode` object. Its `output()` method returns an `OutputHandle` — a symbolic reference to one of the node's output slots. You pass handles as inputs to other nodes to create connections.

```ts
const a = constant.integer({ value: 5 });
a.output()  // → OutputHandle<number> — reference, not the value itself
```

### Connectable

Every input field accepts a literal value, an output handle, or a compatible single-output node:

```ts
const greeting = constant.string({ value: "hi" });

const joined = text.collect({ input_item: "hi", separator: ", " });                // literal values
const joined2 = text.collect({ input_item: greeting.output(), separator: ", " });  // connection + literal
```

### DslNode

The frozen object returned by every factory function:

```ts
const node = constant.integer({ value: 42 });
node.nodeId    // explicit id when supplied, otherwise a UUID
node.nodeType  // "nodetool.constant.Integer"
node.inputs    // { value: 42 }
node.output()  // OutputHandle for the node's default output slot
```

---

## Typed workflows and composition

The terminal-node form `workflow(...nodes)` remains available. A schema and
callback provide named parameters and results:

```ts
import { workflow, run, t, template, text } from "@nodetool-ai/dsl";

const greeter = workflow(
  { name: t.string(), suffix: t.string().optional("!") },
  ({ name, suffix }) => ({ greeting: template`Hello ${name}${suffix}` })
);

const result = await run(greeter, { params: { name: "Ada" } });
// { greeting: "Hello Ada!" }

const pair = workflow({}, () => ({
  first: greeter({ name: "Ada" }, { id: "first" }).greeting,
  second: greeter({ name: "Grace" }, { id: "second" }).greeting
}));
```

`t` provides `t.string()`, `t.int()`, `t.float()`, `t.boolean()`, `t.image()`,
`t.audio()`, `t.video()`, `t.list(item)`, and `t.value()` (an arbitrary value).
For example, `t.list(t.image())` carries image handles into a map body. Required scalar and media parameters become the
existing specialized Input nodes (`StringInput`, `IntegerInput`, `FloatInput`, `BooleanInput`, `ImageInput`, `AudioInput`, `VideoInput`). Lists, arbitrary values, and optional
parameters use ValueInput, which preserves their values without conversion.
`.optional(defaultValue)` supplies a fallback. `.optional()` defaults to `null`
and includes `null` in the inferred type. Missing required parameters fail
before execution.

Callback inputs are symbolic handles. Return a non-empty object whose keys
name the workflow's Output nodes. A definition exposes `.nodes` and `.edges`.
Use `toKernelGraph(definition)` to obtain kernel `properties` and execution
flags for validation, saving, or visual editing. A definition is callable during
another build. Each invocation uses a namespace for its operations and explicit
IDs. Pass `{ id }` to give that namespace a name. Duplicate explicit invocation
names fail. Automatic invocation names are local to the build.

Builders run synchronously during authoring and composition. Keep host side
effects outside them. Runtime values cannot drive ordinary JavaScript `if`,
`for`, string coercion, or property access on media handles.

## Runtime branches, maps, and text

```ts
import { workflow, t, choose, map, template } from "@nodetool-ai/dsl";

const greetings = workflow(
  { names: t.list(t.string()), formal: t.boolean() },
  ({ names, formal }) => ({
    greetings: map(names, (name, index) => choose(formal, {
      then: () => template`${index}: Hello ${name}`,
      else: () => template`${index}: Hi ${name}`
    }))
  })
);
```

`choose(condition, { then, else })` builds both branch callbacks as isolated
Subgraphs. At runtime, If nodes gate every branch input so only the selected
Subgraph executes. Operations must be constructed inside those callbacks.
A producer created before `choose` remains an ordinary upstream dependency.
Branch output types must match, except that `int` and `float` may mix. A mismatch throws `Branch output types do not match`. Callbacks must return synchronously.

`map(list, (item, index) => result)` uses ForEach, a Subgraph body, and Collect.
Item/index correlation and captured values remain aligned. Nested maps are
supported. An empty list produces `[]`. Execution order and concurrency follow
the kernel's existing actors. There is no separate scheduler or `parallelMap`
API.

The `template` tag connects interpolated nodes and handles to the existing
Template node's dynamic inputs. Literal text stays in its template property.
Use this tag instead of coercing symbolic values with a JavaScript template
literal.

Generated nodes expose `node.outputs.slot` for every declared slot, including
names that collide with the node API. Safe names also support `node.slot`, such
as `branch.if_true`. `node.output("slot")` remains available. Reserved names
include `output`, `outputs`, `nodeId`, `nodeType`, `inputs`,
`defaultOutputHandle`, `then`, `constructor`, and `__proto__`.

Canonical export preserves lowered graph nodes, IDs, dynamic output
metadata, input modes, correlations, and connections. It regenerates executable
source rather than preserving the original helper calls or handwritten text.

---

## Basic Workflow

A workflow follows three steps: create nodes, connect them, build the graph.

```ts
import { constant, text } from "@nodetool-ai/dsl";
import { workflow } from "@nodetool-ai/dsl";

// 1. Create nodes
const x = constant.string({ value: "Hello" });
const y = constant.string({ value: ", " });

// 2. Connect nodes by passing output handles
const joined = text.collect({ input_item: x.output(), separator: y.output() });

// 3. Build the workflow graph
const wf = workflow(joined);

console.log(wf.nodes);  // 3 nodes
console.log(wf.edges);  // 2 edges (x→joined, y→joined)
```

The `workflow()` function traces all connections from the terminal nodes back to their sources, producing a serializable `Workflow` object with `nodes` and `edges`.

---

## Connecting Nodes

### Implicit single-output connections

Before:

```ts
const greeting = constant.string({ value: "Hello" });
const joined = text.concat({ a: greeting.output(), b: "!" });
```

After:

```ts
const greeting = constant.string({ value: "Hello" }, { id: "greeting" });
const joined = text.concat({ a: greeting, b: "!" }, { id: "joined" });
const graph = workflow(joined);
```

Both forms produce the same connection. `resolveConnection(value)` recognizes
an explicit handle or a single-output node. It returns `undefined` for literals.
The factory normalizes direct input values before graph traversal. Nodes with
multiple outputs require an explicit selection even when the low-level factory
has a default slot. A node buried inside an object or array is rejected by the
host DSL because that shape cannot wire a direct input.

`{ id }` is available as the second argument on every generated factory.
IDs must be non-empty strings and unique within one build. Omit the argument
to retain automatic IDs. Calling `workflow()` clears the build registry, so a
new build can reuse explicit IDs. Old nodes and handles remain spent.

A node is a symbolic operation. Factory calls build the graph, and `run()`
executes it through the existing kernel. Interpolating a node into a string
throws. Build runtime text with the `template` tag or the Template node's dynamic inputs.

The sandbox pack accepts the same node and ID syntax. It retains readable
automatic IDs and returns kernel nodes with `properties`. It also retains its
existing list fan-in support for arrays of handles or single-output nodes.
The host returns `data`, `streaming`, and `streamingInput`, which its runner
and the CLI translate to kernel descriptors.

### Linear Chain

```ts
const a = constant.string({ value: "five" });
const b = text.collect({ input_item: a.output(), separator: "," });
const c = text.collect({ input_item: b.output(), separator: " " });

const wf = workflow(c);
// 3 nodes, 2 edges: a→b→c
```

### Diamond (Shared Dependencies)

A node's output can be connected to multiple downstream nodes. The graph builder deduplicates automatically.

```ts
const shared = constant.string({ value: "ten" });
const left = text.collect({ input_item: shared.output(), separator: "," });
const right = text.collect({ input_item: shared.output(), separator: " " });
const final = text.collect({ input_item: left.output(), separator: right.output() });

const wf = workflow(final);
// 4 nodes, 4 edges — `shared` appears only once
```

### Multiple Terminal Nodes

Pass multiple nodes to `workflow()` to trace all branches:

```ts
const branch1 = text.collect({ input_item: x.output(), separator: "," });
const branch2 = text.collect({ input_item: x.output(), separator: " " });

const wf = workflow(branch1, branch2);
```

---

## Multi-Output Nodes

Some nodes produce multiple outputs (e.g., `If` has `if_true` and `if_false`). Use `output("slotName")` to select the slot you want:

```ts
import { control } from "@nodetool-ai/dsl";

const branch = control.if_({ condition: true, value: "hello" });

// Access named outputs
branch.output("if_true")   // → OutputHandle
branch.output("if_false")  // → OutputHandle

// Calling output() without a slot throws when there is no default output
```

Each output slot is individually typed, so TypeScript catches type mismatches at compile time.

---

## Building the Workflow Graph

### `workflow()`

```ts
function workflow(...terminals: WorkflowTerminal[]): Workflow;
function workflow(schema, builder): WorkflowDefinition;
```

A terminal is any node (or object) with a `nodeId`. The first form traces from the terminals via BFS, discovers all connected nodes and edges, performs a topological sort, and returns a frozen `Workflow` object. It throws if no terminal is given, if a terminal belongs to an earlier build, or if the graph has a cycle. A node input that holds a handle nested inside an array or object also throws, because only a handle assigned directly to an input becomes an edge. Give each source its own input instead. The second form is the typed schema form described above.

The result can be serialized to JSON:

```ts
const wf = workflow(outputNode);
const json = JSON.stringify(wf, null, 2);
```

The host runner and CLI convert this host DSL shape to kernel descriptors. The sandbox DSL returns the kernel graph shape directly for agent validation and persistence.

### `run()` / `runGraph()`

```ts
async function run(wf: Workflow, opts?: RunOptions): Promise<WorkflowResult>;
async function runGraph(...terminals: DslNode<never>[]): Promise<WorkflowResult>;
```

`run()` executes the graph locally and returns the last value each result node produced. An `Output` node is keyed by its `name` property, and any other node with no outgoing data edge is keyed by its node id. It throws if the run fails or a node reports an error. `runGraph(...terminals)` is `run(workflow(...terminals))`.

`run()` resolves each node in this order: `RunOptions.registry`, then `NodeRegistry.global`, then the built-in packs (`base-nodes` plus the ElevenLabs, MiniMax, Transformers.js, Hugging Face, and Reve packs, each skipped if it cannot load), then the Python bridge. An unknown type throws `Unknown node type`.

| `RunOptions` field | Meaning |
|---|---|
| `params` | Values for the workflow's typed parameters (the schema form), or Input node values. |
| `userId` | User whose secrets resolve. Defaults to `"1"`, the CLI's local user. |
| `authToken` | Bearer token for calls back to the owning NodeTool API. |
| `registry` | A `NodeRegistry` consulted first. Use it for custom pack nodes. |
| `secretResolver` | `(key, userId) => string \| null`. Without it, secrets come from environment variables only and a node with `requiredSettings` warns that its secret is missing. |
| `bridgeOptions` | Python worker bridge options (`wsUrl`, `workerToken`). Otherwise `NODETOOL_WORKER_URL` and `NODETOOL_WORKER_TOKEN` apply. Graphs with Python nodes connect the bridge automatically. |

### Running from the CLI

`nodetool run <file.ts>` imports a TypeScript or JavaScript file, finds every exported `Workflow` (or workflow definition), runs each, and prints the outputs per export name. It fails with `No Workflow exports found` when the file exports none. `nodetool validate <file.ts>` checks the graph without running it, and `nodetool workflows export-dsl <id_or_file> [-o file]` writes a saved workflow as DSL source. See the [CLI reference](../cli.md).

### Using nodes from a custom pack

Packs are not loaded by `run()`, and they have no generated factory. Build the node with `createNode`, register the pack on a registry, and pass it as `RunOptions.registry`:

```ts
import { createNode, output, workflow, run } from "@nodetool-ai/dsl";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { register } from "nodetool-mypack";

const registry = new NodeRegistry();
register(registry);

const reversed = createNode<{ output: string }, "output">(
  "mypack.text.Reverse",
  { text: "hello" },
  { outputNames: ["output"], defaultOutput: "output" }
);
const result = await run(workflow(output.output({ name: "reversed", value: reversed })), { registry });
// { reversed: "olleh" }
```

`createNode(nodeType, inputs, opts)` takes `id`, `outputNames`, `defaultOutput`, `outputTypes`, `multiOutput`, `streaming`, `streamingInput`, `dynamicOutputs`, `inputMode`, and `outputCorrelation`. The generated factories fill these from node metadata. For a node that streams, copy the flags from its class (`streaming: true` when it overrides `genProcess` or declares `iteration`, `forward`, or `chunk` correlation).

---

## Namespaces

The generated barrel lists the available namespaces. Run `npm run codegen --workspace=packages/dsl` to enumerate the current factories. Import the namespace object and call factory functions:

| Import | Description | Example |
|--------|-------------|---------|
| `constant` | Fixed-value nodes | `constant.integer({ value: 5 })` |
| `text` | Text processing | {% raw %}`text.template({ string: "Hello, {{ name }}" })`{% endraw %} |
| `image` | Image I/O | `image.loadImageFile({ path: "..." })` |
| `audio` | Audio processing | `audio.sliceAudio({ start: 0, end: 5 })` |
| `video` | Video processing | `video.trim({ ... })` |
| `control` | Flow control | `control.if_({ condition: true, value: x })` |
| `agents` | AI agents | `agents.agent({ prompt: "..." })` |
| `geminiText` | Google Gemini | `geminiText.groundedSearch({ ... })` |
| `openaiText` | OpenAI text | `openaiText.webSearch({ ... })` |

Namespaces under `nodetool.` drop the prefix (`nodetool.text` becomes `text`). Other dotted namespaces become camelCase (`gemini.text` becomes `geminiText`, `lib.image.color` becomes `libImageColor`, `vector` stays `vector`). Factory names are the last segment of the node type in camelCase (`nodetool.text.FilterString` becomes `text.filterString`), with a trailing underscore for JavaScript reserved words (`control.if_`) and for repeated names. See the full list in `packages/dsl/src/generated/index.ts`.

---

## Code Generation

The factory functions are auto-generated from node metadata. To regenerate after adding or modifying nodes:

```bash
npm run codegen --workspace=packages/dsl
```

This reads all nodes in `ALL_BASE_NODES` from `@nodetool-ai/base-nodes`, introspects their metadata (inputs, outputs, types, defaults), and emits typed factory functions into `packages/dsl/src/generated/`. The same pass also writes the guest-side native flow modules into `packages/dsl/src/flow/generated/`. Pass `--graph` or `--flow` to regenerate one tree.

Generated files are committed to git. `npm run codegen:check --workspace=packages/dsl` writes nothing and exits 1 when either tree differs from the registry, and CI runs it. The codegen script is at `packages/dsl/scripts/codegen.ts`.

### Type Mapping

| Node Type | TypeScript Type |
|-----------|----------------|
| `str` | `string` |
| `int`, `float` | `number` |
| `bool` | `boolean` |
| `image` | `ImageRef` |
| `audio` | `AudioRef` |
| `video` | `VideoRef` |
| `text` | `TextRef` |
| `dataframe` | `DataframeRef` |
| `folder` | `FolderRef` |
| `storyboard` | `StoryboardRef` |
| `list[T]` | `T[]` |
| `dict[K,V]` | `Record<K, V>` |
| `enum` (with values) | string literal union |
| optional types | `T \| undefined` |
| `union[...]` | union of the mapped types |
| `any` and any unmapped type (models, messages, 3D refs) | `unknown` |

---

## Best Practices

1. **Use namespace imports** — `import { text } from "@nodetool-ai/dsl"` gives you autocompletion for all text nodes.

2. **Let TypeScript catch errors** — the DSL is fully typed. If you pass a `string` where a `number` is expected, the compiler tells you.

3. **Don't reuse handles across builds** — after calling `workflow()`, the internal registry is cleared. Handles from previous builds are stale and will throw if used in a new `workflow()` call.

4. **Build workflows linearly** — create source nodes first, then processing nodes. The immutable API prevents cycles by construction.

5. **Choose the graph boundary**: host DSL graphs run through `run()` or the CLI adapter. Sandbox DSL graphs go directly to agent workflow tools.


## Canonical source and visual editing

`workflowToDsl(graph)` generates canonical TypeScript from a graph. It emits
explicit IDs through generated factories or the low-level `createNode()`
fallback so operation identity survives regeneration. The guarantee covers
representable data-edge graphs and their executable semantics. Control edges
are rejected. Editor layout, comments, variable names, constants, and spreads
from the original source are not preserved.

The initial authoring subset uses imports, `const` bindings, generated factory
calls, literal options, references to earlier bindings, explicit output
selection, and `workflow(...terminals)`. Literal arrays and objects are allowed
where the input contract supports them. Symbolic nested objects are rejected.
The exporter emits only the terminal form `workflow(...terminals)`. It does
not emit typed schema callbacks, returned output objects, or `choose` and
`map`. A saved graph exports as lowered nodes, and Input and Output nodes
export as ordinary nodes.

Arbitrary `if`, loops, mutation, dynamic property access, reflection, unknown
spreads, and filesystem/network behavior fall outside the guaranteed visual
editing subset. They may run during graph construction but do not become
runtime graph control flow. Canonical export preserves graph semantics rather
than arbitrary handwritten TypeScript. See the
[authoring design and follow-up plan](ts-dsl-authoring-design.md).
