---
layout: page
title: "Custom Nodes Guide"
description: "How to create custom NodeTool nodes in a TypeScript package and register them with the runtime."
---

This guide shows you how to create custom NodeTool nodes in a TypeScript package and register them with the runtime.

## 1. Create a package layout

Set up a standard npm package with node source files under `src/nodes/`:

```text
nodetool-mypack/
  package.json
  tsconfig.json
  src/
    nodes/
      math-nodes.ts
    index.ts
```

## 2. Configure `package.json`

Declare your package with `@nodetool-ai/node-sdk` as a dependency:

```json
{
  "name": "@nodetool-ai/mypack",
  "type": "module",
  "version": "0.1.0",
  "description": "Custom nodes for NodeTool",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "node -e \"require('node:fs').rmSync('dist', { recursive: true, force: true })\" && tsc",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@nodetool-ai/node-sdk": "latest"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.1"
  }
}
```

## 3. Configure `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src"]
}
```

## 4. Implement a node

Every node extends **BaseNode** from `@nodetool-ai/node-sdk` and uses the **`@prop`** decorator to declare inputs.

Example `src/nodes/math-nodes.ts`:

```ts
import { BaseNode, prop } from "@nodetool-ai/node-sdk";

export class AddOffsetNode extends BaseNode {
  static readonly nodeType = "mypack.math.AddOffset";
  static readonly title = "Add Offset";
  static readonly description = "Add an offset to a number.";

  @prop({ type: "float", default: 0.0, title: "Value" })
  declare value: number;

  @prop({ type: "float", default: 1.0, title: "Offset" })
  declare offset: number;

  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const value = Number(inputs.value ?? this.value ?? 0);
    const offset = Number(inputs.offset ?? this.offset ?? 1);
    return { output: value + offset };
  }
}

export const MATH_NODES = [AddOffsetNode] as const;
```

Key points:

- Set **`nodeType`** to a unique dotted identifier (e.g. `mypack.math.AddOffset`).
- Declare each input with `@prop({ type, default, title })`. The `type` string uses the NodeTool type system (`"int"`, `"float"`, `"str"`, `"list[any]"`, `"image"`, etc.).
- Use `declare` for property declarations so TypeScript does not emit initializers that conflict with the decorator metadata.
- Implement `async process(inputs)` returning a record of named outputs.
- Inputs arrive via the `inputs` parameter at runtime; fall back to `this.<field>` for default values.
- Export a `const` array of all node classes for easy aggregation.

### Declaring output types

If your node produces a typed output other than the default, set **`metadataOutputTypes`**:

```ts
export class CountNode extends BaseNode {
  static readonly nodeType = "mypack.math.Count";
  static readonly title = "Count";
  static readonly description = "Count items in a list.";
  static readonly metadataOutputTypes = { output: "int" };

  @prop({ type: "list[any]", default: [], title: "Values" })
  declare values: unknown[];

  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const values = (inputs.values ?? this.values ?? []) as unknown[];
    return { output: Array.isArray(values) ? values.length : 0 };
  }
}
```

### Streaming nodes

For nodes that yield results incrementally, override **`genProcess`** and set `isStreamingOutput`:

```ts
export class StreamingNode extends BaseNode {
  static readonly nodeType = "mypack.text.Stream";
  static readonly title = "Stream Text";
  static readonly description = "Stream text chunks.";
  static readonly isStreamingOutput = true;

  @prop({ type: "str", default: "", title: "Text" })
  declare text: string;

  async process(
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return { output: inputs.text ?? this.text };
  }

  async *genProcess(
    inputs: Record<string, unknown>
  ): AsyncGenerator<Record<string, unknown>> {
    const text = String(inputs.text ?? this.text ?? "");
    for (const chunk of text.split(" ")) {
      yield { output: chunk };
    }
  }
}
```

## 5. Export and register nodes

Create `src/index.ts` that exports all node classes and a registration function:

```ts
import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { MATH_NODES } from "./nodes/math-nodes.js";

export const ALL_MYPACK_NODES: readonly NodeClass[] = [
  ...MATH_NODES,
];

export function registerMypackNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_MYPACK_NODES) {
    registry.register(nodeClass);
  }
}
```

The `registerBaseNodes()` function in `@nodetool-ai/base-nodes` follows this same pattern -- it iterates `ALL_BASE_NODES` and calls `registry.register()` for each class.

## 6. Build the package

Compile TypeScript to JavaScript:

```bash
npm run build
```

This removes the `dist/` directory and runs `tsc` to produce compiled output.

## 7. Development loop

Repeat this cycle as you add or modify nodes:

1. Edit node source in `src/nodes/`
2. Run `npm run build` to compile
3. Register nodes by calling your registration function at startup

Run type checking without emitting files:

```bash
npm run lint
```

Run tests:

```bash
npm run test
```

## Prop decorator reference

The **`@prop`** decorator accepts a **`PropOptions`** object:

| Option | Type | Description |
|---|---|---|
| `type` | `string` | NodeTool type string (required) |
| `default` | `unknown` | Default value |
| `title` | `string` | Display name in the UI |
| `description` | `string` | Tooltip text |
| `min` | `number` | Minimum numeric value |
| `max` | `number` | Maximum numeric value |
| `required` | `boolean` | Whether input is required |
| `values` | `(string \| number)[]` | Allowed values for select inputs |

## Related Documentation

- [Package Registry Guide](../packages.md) -- package anatomy and CLI commands.
- [TypeScript DSL Guide](ts-dsl-guide.md) -- type-safe workflow definitions with `@nodetool-ai/dsl`.
