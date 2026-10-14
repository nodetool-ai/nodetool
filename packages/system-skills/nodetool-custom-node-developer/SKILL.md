---
name: nodetool-custom-node-developer
description: "Create or update TypeScript NodeTool nodes and node packs in a NodeTool checkout or an npm package: decorated properties, process methods, streaming, registration. Needs a shell. For custom logic inside the product, use nodetool-js-scripting."
---

You are a NodeTool node developer. You create TypeScript nodes that extend `BaseNode` from `@nodetool-ai/node-sdk`.

This is shell work: writing TypeScript, building and installing an npm pack,
and restarting the server. The in-product agent cannot do it. Inside the
product, custom logic is a Code node or a saved JS script in the QuickJS
sandbox (`nodetool-js-scripting`).

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

## Streaming Output (genProcess)

Streaming is structural. Overriding `genProcess` makes the node emit many
values, and `outputCorrelation` says how each output relates to the run:
`iteration` for one value per yield, `single` for one final value. There is no
streaming flag.

```typescript
import type { OutputCorrelation } from "@nodetool-ai/protocol";

static readonly metadataOutputTypes = { output: "any", index: "int" };
static readonly outputCorrelation: Record<string, OutputCorrelation> = {
  output: { kind: "iteration", source: "__execution__", group: "items" },
  index: { kind: "iteration", source: "__execution__", group: "items" }
};

@prop({ type: "list[any]", default: [], title: "Input List" })
declare input_list: unknown[];

async process(): Promise<Record<string, unknown>> {
  return {};
}

async *genProcess(): AsyncGenerator<Record<string, unknown>> {
  const items = this.input_list ?? [];
  for (let i = 0; i < items.length; i++) {
    yield { output: items[i], index: i };
  }
}
```

A `chunk` output must come from `genProcess` with an `iteration` correlation,
or it stays empty.

## Streaming Input (collector)

A node that consumes a stream sets `isStreamingInput` and implements `run()`,
which reads the input stream and emits when it ends. `process()` alone fires
once with buffered inputs and collects nothing across a stream.

```typescript
import type { StreamingInputs, StreamingOutputs } from "@nodetool-ai/node-sdk";
import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";

static readonly metadataOutputTypes = { output: "list[any]" };
static readonly isStreamingInput = true;
static readonly inputMode: InputMode = "stream";
static readonly outputCorrelation: Record<string, OutputCorrelation> = {
  output: { kind: "aggregate", source: "input_item", collapse: "innermost" }
};

@prop({ type: "any", default: [], title: "Input Item" })
declare input_item: unknown;

async process(): Promise<Record<string, unknown>> {
  return { output: [] };
}

async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
  const items: unknown[] = [];
  for await (const item of inputs.stream("input_item")) {
    items.push(item);
  }
  await outputs.emit("output", items);
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

A ref may carry inline `data`, or only a `uri` (`asset://`, `file://`, storage,
`http`). Read bytes with `loadMediaRefBytes`, which resolves every form. Return
a ref with its `type` discriminator and raw bytes or raw base64 in `data`,
never a `data:` URI.

```typescript
import { loadMediaRefBytes, type ProcessingContext } from "@nodetool-ai/runtime";

@prop({ type: "image", title: "Input Image" })
declare image: { uri?: string; data?: string | Uint8Array; asset_id?: string } | undefined;

async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
  if (!this.image) throw new Error("No image provided");
  const bytes = await loadMediaRefBytes(this.image, context);
  if (!bytes) throw new Error("Image has no readable bytes");
  const result: Uint8Array = await processImage(bytes);
  return { output: { type: "image", data: result, content_type: "image/png" } };
}
```

## Lifecycle Hooks
```typescript
async initialize(): Promise<void> { }   // once at start of run
async preProcess(): Promise<void> { }   // before each process() call
async finalize(): Promise<void> { }     // after all processing
```

# Optional Static Properties

```typescript
static readonly supportsDynamicInputs = true;   // user can add input slots
static readonly supportsDynamicOutputs = true;  // user can add output slots
static readonly inputFields = ["prompt"];       // shown as handles on the node body
static readonly inlineFields = ["model"];       // edited inline on the node
```

Props in neither list appear only in the Inspector.

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
development unlisted packs load automatically. A production server
(`NODETOOL_ENV=production`) and the desktop app
(`NODETOOL_PACKS_REQUIRE_ALLOWLIST=1`) load only packs on the allowlist
(`NODETOOL_PACKS_ALLOWLIST` or `~/.config/nodetool/packs.json`). An unlisted
pack is skipped, so on Desktop add it to the allowlist before restarting. Packs also
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
