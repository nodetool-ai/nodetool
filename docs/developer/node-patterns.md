---
layout: page
title: "Node Implementation Patterns"
description: "Architectural patterns for building TypeScript nodes: single-output, multi-output, streaming, stateful, media refs, enums, and secrets."
---

## Overview

This guide covers the key implementation patterns you will encounter when building custom nodes for NodeTool. Every node extends **`BaseNode`** from `@nodetool-ai/node-sdk`, declares its inputs with the **`@prop`** decorator, and implements a `process()` or `genProcess()` method that receives an `inputs` record and returns an outputs record.

---

## Simple Single-Output

The most common pattern. The node declares one or more `@prop` inputs and returns a single keyed output. Use **`metadataOutputTypes`** to tell the UI the output's type.

This pattern is taken from `ConstantStringNode` in `base-nodes/src/nodes/constant.ts`:

```ts
import { BaseNode, prop } from "@nodetool-ai/node-sdk";

export class ConstantStringNode extends BaseNode {
  static readonly nodeType = "nodetool.constant.String";
  static readonly title = "String";
  static readonly description =
    "Represents a string constant in the workflow.\n    text, string, characters";

  static readonly metadataOutputTypes = {
    output: "str",
  };

  @prop({ type: "str", default: "", title: "Value" })
  declare value: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("value" in inputs) {
      return { output: inputs.value };
    }
    return { output: this.value ?? "" };
  }
}
```

Key points:

- **`metadataOutputTypes`** maps each output key to its type string (`"str"`, `"int"`, `"float"`, `"bool"`, `"image"`, `"audio"`, etc.).
- Input resolution follows the pattern `inputs.field ?? this.field ?? default`.
- The return value is always `Record<string, unknown>` -- a plain object whose keys match the output names.

---

## Multi-Output

When a node produces more than one output, list every key in **`metadataOutputTypes`**. Each key becomes a separate output connector in the UI.

This pattern is taken from `IfNode` in `base-nodes/src/nodes/control.ts`:

```ts
export class IfNode extends BaseNode {
  static readonly nodeType = "nodetool.control.If";
  static readonly title = "If";
  static readonly description =
    "Conditionally executes one of two branches based on a condition.\n" +
    "    control, flow, condition, logic";

  static readonly metadataOutputTypes = {
    if_true: "any",
    if_false: "any",
  };

  static readonly isStreamingOutput = true;
  static readonly syncMode = "zip_all" as const;

  @prop({ type: "bool", default: false, title: "Condition" })
  declare condition: any;

  @prop({ type: "any", default: [], title: "Value" })
  declare value: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const condition = Boolean(inputs.condition ?? this.condition ?? false);
    const value = inputs.value ?? this.value ?? null;

    if (condition) {
      return { if_true: value, if_false: null };
    }
    return { if_true: null, if_false: value };
  }
}
```

Key points:

- Every key declared in `metadataOutputTypes` must appear in the returned object.
- Set `isStreamingOutput = true` when the node emits values that downstream nodes should process one at a time.

---

## Streaming with genProcess()

For nodes that emit multiple results over time, implement **`genProcess()`** as an async generator. The engine calls `genProcess()` instead of `process()` when it is defined.

This pattern is taken from `ForEachNode` in `base-nodes/src/nodes/control.ts`:

```ts
export class ForEachNode extends BaseNode {
  static readonly nodeType = "nodetool.control.ForEach";
  static readonly title = "For Each";
  static readonly description =
    "Iterate over a list and emit each item sequentially.\n" +
    "    iterator, loop, list, sequence";

  static readonly metadataOutputTypes = {
    output: "any",
    index: "int",
  };

  static readonly isStreamingOutput = true;

  @prop({ type: "list[any]", default: [], title: "Input List" })
  declare input_list: any;

  async process(_inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(
    inputs: Record<string, unknown>
  ): AsyncGenerator<Record<string, unknown>> {
    const values = (inputs.input_list ?? this.input_list ?? []) as unknown[];
    const list = Array.isArray(values) ? values : [values];

    for (const [index, item] of list.entries()) {
      yield { output: item, index };
    }
  }
}
```

Key points:

- You must still provide a `process()` stub (it can return `{}`).
- Each `yield` sends one batch of outputs to downstream nodes.
- Set `isStreamingOutput = true` so the engine knows to iterate the generator.

---

## Stateful Collector

Some nodes accumulate values across multiple invocations within a single workflow run. Use **`syncMode = "on_any"`** to fire on every incoming value, and **`initialize()`** to reset state at the start of each run.

This pattern is taken from `CollectTextNode` in `base-nodes/src/nodes/text.ts`:

```ts
export class CollectTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Collect";
  static readonly title = "Collect";
  static readonly description =
    "Collects a stream of text inputs into a single concatenated string.\n" +
    "    text, collect, list, stream, aggregate";

  static readonly metadataOutputTypes = {
    output: "str",
  };

  static readonly syncMode = "on_any" as const;

  private _items: string[] = [];

  @prop({ type: "str", default: "", title: "Input Item" })
  declare input_item: any;

  @prop({ type: "str", default: "", title: "Separator" })
  declare separator: any;

  async initialize(): Promise<void> {
    this._items = [];
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const separator = String(inputs.separator ?? this.separator ?? "");
    if ("input_item" in inputs) {
      this._items.push(String(inputs.input_item ?? ""));
    }
    return { output: this._items.join(separator) };
  }
}
```

Key points:

- **`syncMode`** controls when the node fires. `"zip_all"` (the default) waits for all inputs; `"on_any"` fires as soon as any single input arrives.
- Private instance fields (like `_items`) hold state between invocations.
- **`initialize()`** runs once at the start of each workflow execution -- use it to clear accumulated state.

---

## Media Refs

Images, audio, and video are passed between nodes as **ref objects** -- plain objects with `uri`, `data`, and metadata fields. Nodes load bytes from the ref and return new refs after processing.

This pattern is taken from `ResizeNode` in `base-nodes/src/nodes/image.ts`:

```ts
import sharp from "sharp";

// Helper: extract bytes from an image ref
async function imageBytesAsync(image: unknown): Promise<Uint8Array> {
  if (!image || typeof image !== "object") return new Uint8Array();
  const ref = image as { uri?: string; data?: Uint8Array | string };
  if (ref.data) {
    return ref.data instanceof Uint8Array
      ? ref.data
      : Uint8Array.from(Buffer.from(ref.data, "base64"));
  }
  if (typeof ref.uri === "string" && ref.uri) {
    const response = await fetch(ref.uri);
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Uint8Array();
}

export class ResizeNode extends BaseNode {
  // ...
  @prop({ type: "image", default: { type: "image", uri: "", data: null }, title: "Image" })
  declare image: any;

  @prop({ type: "int", default: 512, title: "Width", min: 0, max: 4096 })
  declare width: any;

  @prop({ type: "int", default: 512, title: "Height", min: 0, max: 4096 })
  declare height: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const image = inputs.image ?? this.image ?? {};
    const bytes = await imageBytesAsync(image);
    const width = Number(inputs.width ?? this.width ?? 512);
    const height = Number(inputs.height ?? this.height ?? 512);

    const outputBytes = await sharp(bytes).resize(width, height).toBuffer();
    return {
      output: {
        data: Buffer.from(outputBytes).toString("base64"),
        width,
        height,
      },
    };
  }
}
```

The same approach applies to audio refs (see `audioBytesAsync` in `audio.ts`). The key insight is that media data travels as base64-encoded `data` or as a `uri` that the node fetches on demand.

---

## Enum Inputs

Use `@prop` with `type: "enum"` and a **`values`** array to present a dropdown in the UI.

This pattern is taken from `FilterNumberNode` in `base-nodes/src/nodes/numbers.ts`:

```ts
@prop({
  type: "enum",
  default: "greater_than",
  title: "Filter Type",
  description: "The type of filter to apply",
  values: [
    "greater_than",
    "less_than",
    "equal_to",
    "even",
    "odd",
    "positive",
    "negative",
  ],
})
declare filter_type: any;
```

In your `process()` method, cast the value from `inputs`:

```ts
const filterType = String(inputs.filter_type ?? this.filter_type ?? "greater_than");
```

---

## Secret Access

Nodes that call external APIs declare the keys they need in **`requiredSettings`**. The engine injects matching secrets into `inputs._secrets` before calling `process()`.

This pattern is taken from the OpenAI nodes in `base-nodes/src/nodes/openai.ts`:

```ts
export class EmbeddingNode extends BaseNode {
  static readonly nodeType = "openai.text.Embedding";
  static readonly title = "Embedding";
  static readonly description = "Generate vector representations of text.";

  static readonly requiredSettings = ["OPENAI_API_KEY"];

  // ... @prop declarations ...

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey =
      (inputs._secrets as Record<string, string>)?.OPENAI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      "";
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: inputs.input ?? this.input, model: "text-embedding-3-small" }),
    });
    const data = await response.json();
    return { output: data.data[0].embedding };
  }
}
```

Key points:

- **`requiredSettings`** is a static string array of secret key names.
- The base class `_injectSecrets()` method resolves secrets from the runtime's secret store and merges them into `inputs._secrets`.
- Always fall back to `process.env` for local development.

---

## Best Practices

### Input Resolution

Always resolve inputs with the three-level fallback:

```ts
const value = inputs.field ?? this.field ?? defaultValue;
```

This ensures the node works whether the value comes from a connected edge (`inputs`), a manually set property (`this`), or the declared default.

### Async / Await

All `process()` and `genProcess()` methods are async. Use `await` for any I/O -- file reads, HTTP calls, or image processing -- to keep the workflow engine responsive.

### metadataOutputTypes

Always declare **`metadataOutputTypes`** so the UI can render the correct output connectors and validate connections between nodes. If you omit it, the node will have no visible outputs.

### Error Handling

Let exceptions propagate or throw `Error` with a clear message. The engine catches them and displays the error on the node in the UI.

### Docstring Format

The `description` static field serves double duty: the first line is the node's description in the UI; subsequent indented lines are search keywords.

```ts
static readonly description =
  "Short description of what the node does.\n" +
  "    keyword1, keyword2, keyword3";
```

### File Structure

Nodes are organized by category in `packages/base-nodes/src/nodes/`. Each file exports an array of node classes (e.g., `CONTROL_NODES`, `TEXT_NODES`) and the package index registers them all. The system automatically discovers all registered classes inheriting from **`BaseNode`**.
