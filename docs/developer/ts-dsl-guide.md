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
6. [Building the Workflow Graph](#building-the-workflow-graph)
7. [Namespaces](#namespaces)
8. [Code Generation](#code-generation)
9. [Best Practices](#best-practices)

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

The package root is the only entry point — `package.json` exports `.` and
`./flow`, so a subpath import of a generated namespace file does not resolve.
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

Every input field accepts either a **literal value** or an **OutputHandle**:

```ts
const greeting = constant.string({ value: "hi" });

const joined = text.collect({ input_item: "hi", separator: ", " });                // literal values
const joined2 = text.collect({ input_item: greeting.output(), separator: ", " });  // connection + literal
```

### DslNode

The frozen object returned by every factory function:

```ts
const node = constant.integer({ value: 42 });
node.nodeId    // unique UUID
node.nodeType  // "nodetool.constant.Integer"
node.inputs    // { value: 42 }
node.output()  // OutputHandle for the node's default output slot
```

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
function workflow(...terminals: DslNode<never>[]): Workflow;
```

Traces from terminal nodes via BFS, discovers all connected nodes and edges, performs topological sort, and returns a frozen `Workflow` object.

The result can be serialized to JSON:

```ts
const wf = workflow(outputNode);
const json = JSON.stringify(wf, null, 2);
```

This JSON is compatible with the NodeTool workflow format used by the visual editor and the workflow runner.

### `run()` / `runGraph()`

```ts
async function run(wf: Workflow, opts?: RunOptions): Promise<WorkflowResult>;
async function runGraph(...terminals: DslNode<never>[]): Promise<WorkflowResult>;
```

`run()` executes the graph locally via `WorkflowRunner`. By default it resolves executors from `NodeRegistry.global`, or you can pass an explicit registry via `RunOptions.registry`.

---

## Namespaces

All 441 nodes are organized into 69 namespaces. Import the namespace object and call factory functions:

| Import | Description | Example |
|--------|-------------|---------|
| `constant` | Fixed-value nodes | `constant.integer({ value: 5 })` |
| `text` | Text processing | `text.template({ string: "Hello, {{ name }}" })` |
| `image` | Image I/O | `image.loadImageFile({ path: "..." })` |
| `audio` | Audio processing | `audio.sliceAudio({ start: 0, end: 5 })` |
| `video` | Video processing | `video.trim({ ... })` |
| `control` | Flow control | `control.if_({ condition: true, value: x })` |
| `agents` | AI agents | `agents.agent({ prompt: "..." })` |
| `geminiText` | Google Gemini | `geminiText.groundedSearch({ ... })` |
| `openaiText` | OpenAI text | `openaiText.webSearch({ ... })` |

See the full list in `packages/dsl/src/generated/index.ts`.

---

## Code Generation

The factory functions are auto-generated from node metadata. To regenerate after adding or modifying nodes:

```bash
npm run codegen --workspace=packages/dsl
```

This reads all nodes registered in `@nodetool-ai/base-nodes`, introspects their metadata (inputs, outputs, types, defaults), and emits typed factory functions into `packages/dsl/src/generated/`.

Generated files are committed to git. The codegen script is at `packages/dsl/scripts/codegen.ts`.

### Type Mapping

| Node Type | TypeScript Type |
|-----------|----------------|
| `str` | `string` |
| `int`, `float` | `number` |
| `bool` | `boolean` |
| `image` | `ImageRef` |
| `audio` | `AudioRef` |
| `video` | `VideoRef` |
| `list[T]` | `T[]` |
| `dict[K,V]` | `Record<K, V>` |
| `enum` | string literal union |
| `any` | `unknown` |

---

## Best Practices

1. **Use namespace imports** — `import { text } from "@nodetool-ai/dsl"` gives you autocompletion for all text nodes.

2. **Let TypeScript catch errors** — the DSL is fully typed. If you pass a `string` where a `number` is expected, the compiler tells you.

3. **Don't reuse handles across builds** — after calling `workflow()`, the internal registry is cleared. Handles from previous builds are stale and will throw if used in a new `workflow()` call.

4. **Build workflows linearly** — create source nodes first, then processing nodes. The immutable API prevents cycles by construction.

5. **Serialize for interop** — `JSON.stringify(workflow(node))` produces a workflow that can be loaded in the visual editor or executed via the API.
