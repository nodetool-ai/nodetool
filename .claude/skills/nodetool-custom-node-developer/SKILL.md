---
name: nodetool-custom-node-developer
description: Create custom NodeTool nodes, implement BaseNode subclasses, use @prop decorators, build node packages with process/genProcess methods, register nodes, handle media refs and secrets. Use when user asks to create a node, add a node type, build a custom node, implement a processor, or extend NodeTool with new functionality.
---

You are a NodeTool node developer. You create TypeScript nodes that extend `BaseNode` from `@nodetool/node-sdk`.

# Package Layout

```
my-nodes/
├── package.json          # depends on @nodetool/node-sdk
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
import { BaseNode, prop } from "@nodetool/node-sdk";

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
  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const text = String(inputs.input_text ?? this.input_text ?? "");
    const count = Number(inputs.count ?? this.count ?? 10);
    return { output: text.repeat(count) };
  }
}
```

# Input Resolution Pattern

Always resolve inputs with this fallback chain:
```typescript
const value = inputs.field ?? this.field ?? defaultValue;
```
- `inputs.field` — runtime connection value
- `this.field` — static property value set by user
- `defaultValue` — hardcoded fallback

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

async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
  return { text: "result", confidence: 0.95 }; // ALL keys must be returned
}
```

## Streaming Node (genProcess)
```typescript
static readonly isStreamingOutput = true;
static readonly metadataOutputTypes = { output: "str" };

async *genProcess(inputs: Record<string, unknown>): AsyncGenerator<Record<string, unknown>> {
  for (const item of items) {
    yield { output: item };
  }
}
```

## Stateful Collector
```typescript
static readonly syncMode = "on_any"; // fires on each incoming value

private collected: string[] = [];

initialize(): void {
  this.collected = []; // reset per run
}

async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
  this.collected.push(String(inputs.item ?? ""));
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

async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
  const secrets = (inputs._secrets as Record<string, string>) ?? {};
  const apiKey = secrets.MY_API_KEY || process.env.MY_API_KEY;
  if (!apiKey) throw new Error("MY_API_KEY not configured");
  // use apiKey...
}
```

## Media Refs (Image/Audio/Video)
```typescript
@prop({ type: "image", title: "Input Image" })
declare image: any;

async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
  const img = inputs.image as { uri?: string; data?: string } | undefined;
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

# Registration

```typescript
// src/index.ts
import { NodeRegistry } from "@nodetool/node-sdk";
import { MyNode, OtherNode } from "./nodes/my-nodes";

export const ALL_MYPACK_NODES = [MyNode, OtherNode] as const;

export function registerMypackNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_MYPACK_NODES) {
    registry.register(nodeClass);
  }
}
```

Then register in `packages/base-nodes/src/index.ts` (or your package's entry).

# Testing

```typescript
import { describe, it, expect } from "vitest";
import { MyNode } from "../src/nodes/my-nodes";

describe("MyNode", () => {
  it("processes input", async () => {
    const node = new MyNode();
    const result = await node.process({ input_text: "hello", count: 3 });
    expect(result.output).toBe("hellohellohello");
  });
});
```

# Common Pitfalls

- **Forgetting output keys**: Every key in `metadataOutputTypes` must appear in the return object
- **Wrong input resolution**: Always use `inputs.field ?? this.field ?? default`, never just `inputs.field`
- **nodeType format**: Must be `namespace.category.Name` with dots as separators
- **Mutable state without initialize()**: If using instance fields, reset them in `initialize()`
- **Missing secrets declaration**: Add to `requiredSettings` array for proper UI prompting
