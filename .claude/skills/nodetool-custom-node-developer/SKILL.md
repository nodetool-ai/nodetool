---
name: nodetool-custom-node-developer
description: Create custom NodeTool nodes, implement BaseNode subclasses, use @prop decorators, build node packages with process/genProcess methods, register nodes, handle media refs and secrets. Use when user asks to create a node, add a node type, build a custom node, implement a processor, or extend NodeTool with new functionality.
---

You are a NodeTool node developer. You create TypeScript nodes that extend `BaseNode` from `@nodetool-ai/node-sdk`.

# Package Layout

```
my-nodes/
├── package.json          # depends on @nodetool-ai/node-sdk
├── tsconfig.json         # extends ../../tsconfig.base.json
├── src/
│   ├── index.ts          # exports registration function + ALL_NODES array
│   └── nodes/
│       ├── category-a.ts # node classes
│       └── category-b.ts
└── tests/
    └── nodes.test.ts
```

# Node Template

```typescript
import { BaseNode, prop } from "@nodetool-ai/node-sdk";

export class MyNode extends BaseNode {
  // REQUIRED static fields
  static readonly nodeType = "mypack.category.NodeName"; // namespace.category.Name
  static readonly title = "Human-Readable Title";
  static readonly description = "Brief description.\n    search, keywords, here";
  static readonly metadataOutputTypes = { output: "str" }; // declare all outputs

  // Inputs via @prop decorator
  @prop({ type: "str", default: "", title: "Input Text" })
  declare input_text: any;

  @prop({ type: "int", default: 10, min: 1, max: 100, title: "Count" })
  declare count: any;

  // Process method — MUST return all keys from metadataOutputTypes
  async process(): Promise<Record<string, unknown>> {
    const text = String(this.input_text ?? "");
    const count = Number(this.count ?? 10);
    return { output: text.repeat(count) };
  }
}
```

# Input Resolution Pattern

Property values **and** connected input values are assigned to instance fields
*before* `process()` is called, so always read inputs from `this`:
```typescript
const value = this.field ?? defaultValue;
```
- `this.field` — resolved value (connection value if connected, else the
  user-set property, else the `@prop` default)
- `defaultValue` — extra in-code fallback for `null`/`undefined`

Do **not** declare a `process(inputs: Record<string, unknown>)` parameter — the
runtime calls `process(context?: ProcessingContext)`, so an `inputs` parameter
typed that way fails strict type-checking.

# @prop Decorator Options

| Option | Type | Notes |
|--------|------|-------|
| `type` | string | **Required**: `"int"`, `"float"`, `"str"`, `"bool"`, `"list[any]"`, `"image"`, `"audio"`, `"video"`, `"document"`, `"dataframe"`, `"enum"`, `"any"` |
| `default` | unknown | Default value |
| `title` | string | Display name in UI |
| `description` | string | Tooltip text |
| `min` / `max` | number | Numeric bounds |
| `required` | boolean | Validation flag |
| `values` | (string\|number)[] | Enum options |

# Patterns

## Multi-Output Node
```typescript
static readonly metadataOutputTypes = { text: "str", confidence: "float" };

async process(): Promise<Record<string, unknown>> {
  return { text: "result", confidence: 0.95 }; // ALL keys must be returned
}
```

## Streaming Node (genProcess)
```typescript
static readonly isStreamingOutput = true;
static readonly metadataOutputTypes = { output: "str" };

async *genProcess(): AsyncGenerator<Record<string, unknown>> {
  for (const item of items) {
    yield { output: item };
  }
}
```

## Stateful Collector
```typescript
static readonly syncMode = "on_any"; // fires on each incoming value

@prop({ type: "any", title: "Item" })
declare item: unknown;

private collected: unknown[] = [];

initialize(): void {
  this.collected = []; // reset per run
}

async process(): Promise<Record<string, unknown>> {
  this.collected.push(this.item);
  return { output: this.collected };
}
```

## Enum Input
```typescript
@prop({ type: "enum", values: ["low", "medium", "high"], default: "medium", title: "Quality" })
declare quality: any;
```

## Secrets / API Keys
```typescript
static readonly requiredSettings = ["MY_API_KEY"];

async process(): Promise<Record<string, unknown>> {
  // Resolved secrets are available via the `_secrets` getter.
  const apiKey = this._secrets.MY_API_KEY || process.env.MY_API_KEY;
  if (!apiKey) throw new Error("MY_API_KEY not configured");
  // use apiKey...
}
```

## Media Refs (Image/Audio/Video)
```typescript
@prop({ type: "image", title: "Input Image" })
declare image: { uri?: string; data?: string } | undefined;

async process(): Promise<Record<string, unknown>> {
  const img = this.image;
  if (!img) throw new Error("No image provided");
  // img.data is base64, img.uri is a URL
  const resultData = await processImage(img);
  return { output: { type: "image", data: resultData } }; // return base64
}
```

## Lifecycle Hooks
```typescript
initialize(): void { }    // once at start of run
preProcess(): void { }    // before each process() call
finalize(): void { }      // after all processing
```

# Optional Static Properties

```typescript
static readonly exposeAsTool = true;         // usable as Agent tool
static readonly isDynamic = true;            // dynamic schema
static readonly supportsDynamicOutputs = true;
static readonly isStreamingInput = true;
static readonly basicFields = ["prompt", "model"]; // shown first in UI
```

# Scaffold a Pack

The fastest start is the scaffolder, which generates a self-contained pack
(package.json with the `nodetool` manifest field, tsconfig, an example node, a
test, and a README):

```bash
npm run create:pack -- @myorg/my-nodes        # in the nodetool repo
# or directly: node scripts/create-pack.mjs @myorg/my-nodes ./my-nodes
```

# Registration

```typescript
// src/index.ts
import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { MyNode, OtherNode } from "./nodes/my-nodes.js";

export const ALL_NODES: readonly NodeClass[] = [MyNode, OtherNode];

export function register(registry: NodeRegistry): void {
  for (const nodeClass of ALL_NODES) {
    registry.register(nodeClass);
  }
}
```

The server auto-loads packs — no need to edit its source. Mark the package as a
pack with a `nodetool` field in `package.json`, naming the export above:

```jsonc
{
  "name": "@myorg/my-nodes",
  "main": "dist/index.js",
  "nodetool": { "apiVersion": 1, "register": "register" }
}
```

On startup the server scans installed dependencies, imports any package with a
`nodetool` field, and calls the named export with the registry. Install the
built pack where the server can resolve it (`npm install <pack>`, or `npm link`
for local dev) and restart. The export may be sync or `async`.

**Trust model.** Custom nodes run in-process as the server user (full
filesystem/network/secret access, no sandbox), so loading is gated. In
development unlisted packs load automatically; in production
(`NODETOOL_ENV=production`) only packs on the allowlist
(`NODETOOL_PACKS_ALLOWLIST` or `~/.config/nodetool/packs.json`) load. Packs also
cannot register under reserved namespaces (`nodetool.`, `lib.`, provider names)
or shadow an existing node type. Only install packs you trust.

# Testing

```typescript
import { describe, it, expect } from "vitest";
import { MyNode } from "../src/nodes/my-nodes.js";

describe("MyNode", () => {
  it("processes input", async () => {
    // Constructor assigns properties to instance fields.
    const node = new MyNode({ input_text: "hello", count: 3 });
    const result = await node.process();
    expect(result.output).toBe("hellohellohello");
  });
});
```

# Common Pitfalls

- **Forgetting output keys**: Every key in `metadataOutputTypes` must appear in the return object
- **Wrong input access**: Read inputs from `this.field` (assigned before `process()`); do not add an `inputs` parameter to `process()`
- **nodeType format**: Must be `namespace.category.Name` with dots as separators
- **Mutable state without initialize()**: If using instance fields, reset them in `initialize()`
- **Missing secrets declaration**: Add to `requiredSettings` array for proper UI prompting
