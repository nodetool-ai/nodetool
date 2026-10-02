---
layout: page
title: "Node Implementation Patterns"
description: "Architectural patterns for building TypeScript nodes: single-output, multi-output, streaming, stateful, media refs, enums, and secrets."
---

## Overview

This guide covers the key implementation patterns you will encounter when building custom nodes for NodeTool. Every node extends **`BaseNode`** from `@nodetool-ai/node-sdk`, declares its inputs with the **`@prop`** decorator, and implements a `process()` or `genProcess()` method that reads input values from `this.<field>` and returns an outputs record. The optional argument is a `ProcessingContext` from `@nodetool-ai/runtime`.

---

## Simple Single-Output

The most common pattern. The node declares one or more `@prop` inputs and returns a single keyed output. Use **`metadataOutputTypes`** to tell the UI the output's type.

This pattern is adapted from `ConstantStringNode` in `packages/core-nodes/src/nodes/constant.ts`:

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
  declare value: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: this.value ?? "" };
  }
}
```

Key points:

- **`metadataOutputTypes`** maps each output key to its type string (`"str"`, `"int"`, `"float"`, `"bool"`, `"image"`, `"audio"`, etc.).
- The engine assigns connected input values onto the instance before calling `process()`, so read them as `this.field`.
- The return value is a plain object whose keys match the declared output names.
- Type the field with its real type (`string`, `number`, a ref type) instead of `any`. The runtime assigns the value, so `declare` carries only the compile-time type.

---

## Multi-Output

When a node produces more than one output, list every key in **`metadataOutputTypes`**. Each key becomes a separate output connector in the UI.

This pattern is adapted from `IfNode` in `packages/core-nodes/src/nodes/control.ts`. It reads its inputs as a buffered set (`inputMode = "buffered"`) and routes the `value` input to whichever branch matches the condition. The **`outputCorrelation`** map declares that both outputs *forward* the `value` input — so each output carries the same correlation lineage as its source, which is how the scheduler knows the branch is a passthrough rather than a new value:

```ts
import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";

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

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    if_true: { kind: "forward", source: "value" },
    if_false: { kind: "forward", source: "value" },
  };

  @prop({ type: "bool", default: false, title: "Condition" })
  declare condition: boolean;

  @prop({ type: "any", default: [], title: "Value" })
  declare value: unknown;

  async process(): Promise<Record<string, unknown>> {
    const condition = Boolean(this.condition ?? false);
    const value = this.value ?? null;
    // Return only the taken branch. A missing key sends no message on that
    // output, so the untaken branch's downstream nodes are skipped.
    if (condition) {
      return { if_true: value };
    }
    return { if_false: value };
  }
}
```

Key points:

- Every key you return must be declared in `metadataOutputTypes`. Declared outputs you leave out of the returned object (or set to `undefined`) send nothing, and nodes wired only to them do not run. Returning `null` for an output does send a message.
- **`inputMode`** is one of `"buffered"` (collect a matched set of inputs, then call `process()` once), `"stream"` (consume inputs as an async stream via `run()`), or `"controlled"` (the node is driven by control edges). Most nodes leave it `undefined` (the default buffered behavior).
- **`outputCorrelation`** maps each output to how it relates to its source input. A `{ kind: "forward", source: "<input>" }` entry means the output forwards that input's correlation token unchanged. There is no separate `isStreamingOutput` flag, and streaming behavior is *inferred* from `forward`, `iteration`, or `chunk` correlation, or from overriding `genProcess()`. Once you declare it, every declared output needs an entry. See [Custom Nodes Guide §11](custom-nodes-guide.md#11-streaming-nodes-genprocess).

---

## Streaming with genProcess()

For nodes that emit multiple results over time, implement **`genProcess()`** as an async generator. The engine calls `genProcess()` instead of `process()` when it is defined.

This pattern is adapted from `ForEachNode` in `packages/core-nodes/src/nodes/control.ts` (the real node also has a `limit` property). It buffers its input list, then emits each element as a separate *iteration* — `outputCorrelation` declares the outputs as `kind: "iteration"`, which mints a fresh correlation token per emitted item so downstream nodes treat each one as a distinct logical value:

```ts
import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";

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

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "iteration", source: "__execution__", group: "items" },
    index: { kind: "iteration", source: "__execution__", group: "items" },
  };

  @prop({ type: "list[any]", default: [], title: "Input List" })
  declare input_list: unknown[];

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const values = this.input_list ?? [];
    const list = Array.isArray(values) ? values : [values];
    for (const [index, item] of list.entries()) {
      yield { output: item, index };
    }
  }
}
```

Key points:

- You must still provide a `process()` stub (it can return `{}`) — the base class requires it.
- Each `yield` sends one batch of outputs to downstream nodes. Yield objects. A value returned from the generator is discarded.
- Declared `iteration` outputs that share a `group` are emitted together, so yield one object carrying all of them, as above.
- Nodes that consume a stream implement `run(inputs, outputs)` instead. See [Custom Nodes Guide §11](custom-nodes-guide.md#streaming-inputs-run).
- `genProcess()` is detected automatically (the base class checks whether the subclass overrides it) — there is no `isStreamingOutput` flag to set. The `outputCorrelation` `iteration` kind tells the scheduler each yielded value is a new correlated item.

---

## Stateful Collector

Some nodes accumulate values across multiple invocations within a single workflow run. Hold the state in a private instance field and use **`initialize()`** to reset it at the start of each run.

This pattern is adapted from `CollectTextNode` in `packages/text-nodes/src/nodes/text-extra.ts`:

```ts
export class CollectTextNode extends BaseNode {
  static readonly nodeType = "nodetool.text.Collect";
  static readonly title = "Collect Text";
  static readonly description =
    "Collects streaming text inputs into a single concatenated string.\n" +
    "    text, collect, stream, aggregate";

  static readonly metadataOutputTypes = {
    output: "str",
  };

  private _items: string[] = [];

  @prop({ type: "str", default: "", title: "Input Item" })
  declare input_item: string;

  @prop({ type: "str", default: "", title: "Separator" })
  declare separator: string;

  async initialize(): Promise<void> {
    this._items = [];
  }

  async process(): Promise<Record<string, unknown>> {
    this._items.push(this.input_item);
    return { output: this._items.join(this.separator) };
  }
}
```

Key points:

- Private instance fields (like `_items`) hold state between invocations within a single run.
- **`initialize()`** runs once per node before the workflow run starts -- use it to clear accumulated state. `finalize()` runs when the node finishes, even after an error.
- The node instance is reused across the items it receives, so `process()` is called once per incoming value and appends to `_items`.

---

## Media Refs

Images, audio, video, and 3D models are passed between nodes as **ref objects**: plain objects with a `type` discriminator (`"image"`, `"audio"`, `"video"`, `"model_3d"`) plus `uri`, `data`, and metadata fields. Nodes load bytes from the ref and return new refs after processing.

Read input bytes with `loadMediaRefBytes(ref, context)` from `@nodetool-ai/runtime`. It resolves inline `data`, `asset://` references, storage-backed URIs, and `http(s)` URLs (through the media egress policy), so a node that reads `ref.data` or calls `fetch(ref.uri)` itself silently drops media supplied as an asset. It returns `null` when it finds no bytes.

Build output refs with a helper. `imageRefFromBytes(bytes)` from `@nodetool-ai/runtime` sets `type`, raw base64 `data`, the MIME type, and the dimensions when `sharp` is present.

```ts
import sharp from "sharp";
import type { ImageRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { imageRefFromBytes, loadMediaRefBytes } from "@nodetool-ai/runtime";

export class ResizeNode extends BaseNode {
  // ...
  @prop({ type: "image", default: { type: "image", uri: "", data: null }, title: "Image" })
  declare image: ImageRef;

  @prop({ type: "int", default: 512, title: "Width", min: 1, max: 4096 })
  declare width: number;

  @prop({ type: "int", default: 512, title: "Height", min: 1, max: 4096 })
  declare height: number;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await loadMediaRefBytes(this.image, context);
    if (!bytes) throw new Error("Resize: no image data");

    const outputBytes = await sharp(bytes).resize(this.width, this.height).toBuffer();
    return { output: await imageRefFromBytes(outputBytes) };
  }
}
```

Rules for refs (the repository's `packages/AGENTS.md` lists more):

- `data` is raw base64 or a `Uint8Array`, never a `data:` URI. Put the MIME type in a field such as `mimeType`.
- Always include `type` on a ref you emit. A bare `Uint8Array` output is an untyped value.
- Check `data.length > 0` instead of truthiness when choosing between `data` and `uri`.
- Audio and video have equivalent helpers in their packages, such as `audioBytesAsync` in `packages/audio-nodes/src/nodes/audio.ts`.

---

## Enum Inputs

Use `@prop` with `type: "enum"` and a **`values`** array to present a dropdown in the UI.

This pattern is adapted from `FilterStringNode` in `packages/text-nodes/src/nodes/text-extra.ts`, which offers six filter types:

```ts
@prop({
  type: "enum",
  default: "contains",
  title: "Filter Type",
  description: "The type of filter to apply",
  values: ["contains", "starts_with", "ends_with"],
})
declare filter_type: "contains" | "starts_with" | "ends_with";
```

The value arrives unchecked, so validate it before relying on it. `FilterStringNode` guards the prop with a type predicate and matches nothing when the value is not one it implements.

---

## Secret Access

Nodes that call external APIs declare the keys they need in **`requiredSettings`**. Before calling `process()`, the base class resolves each key through `ProcessingContext.getSecret()` and exposes them as **`this._secrets`**. A key that does not resolve is logged as a warning and is absent from `this._secrets`.

This pattern is adapted from the OpenAI nodes in `packages/llm-nodes/src/nodes/openai.ts` (e.g. `openai.text.Embedding`, whose output type is `"list"`):

```ts
export class EmbeddingNode extends BaseNode {
  static readonly nodeType = "openai.text.Embedding";
  static readonly title = "Embedding";
  static readonly description = "Generate vector representations of text.";

  static readonly requiredSettings = ["OPENAI_API_KEY"];

  @prop({ type: "str", default: "", title: "Input" })
  declare input: string;

  static readonly metadataOutputTypes = { output: "list[float]" };

  async process(): Promise<Record<string, unknown>> {
    const apiKey = this._secrets.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: this.input, model: "text-embedding-3-small" }),
    });
    const data = await response.json();
    return { output: data.data[0].embedding };
  }
}
```

Key points:

- **`requiredSettings`** is a static string array of secret key names.
- The base class resolves each key from the active `ProcessingContext` and assigns them to `this._secrets` before `process()` runs.
- The server's secret resolver checks the user's secret store first and then the process environment, so a node does not need its own `process.env` fallback.
- Inside `run()`, `this._secrets` is populated the same way.
- Outbound requests to a URL a caller or model chose belong behind `safeFetch` from `@nodetool-ai/runtime`. A fixed provider endpoint like the one above does not.

---

## Best Practices

### Input Resolution

Property values for `@prop` fields are populated on the instance before `process()` is called. Resolve with:

```ts
const value = this.field ?? defaultValue;
```

The engine handles connected edges, manually set values, and declared defaults — by the time `process()` runs, `this.field` already holds the effective value.

### Async / Await

All `process()` and `genProcess()` methods are async. Use `await` for any I/O -- file reads, HTTP calls, or image processing -- to keep the workflow engine responsive.

### metadataOutputTypes

Always declare **`metadataOutputTypes`** so the UI can render the correct output connectors and validate connections between nodes. If you omit it (and the static `outputTypes` fallback), the node has no outputs.

### Error Handling

Let exceptions propagate or throw `Error` with a clear message. The engine catches them and displays the error on the node in the UI.

### Docstring Format

The `description` static field serves double duty: the first line is the summary other tools show, and the node search indexes the whole text, so subsequent indented lines work as keywords.

```ts
static readonly description =
  "Short description of what the node does.\n" +
  "    keyword1, keyword2, keyword3";
```

### File Structure

Nodes are organized by category across the node packages — `packages/core-nodes/` (constants, control flow, math), `packages/text-nodes/`, `packages/image-nodes/`, `packages/llm-nodes/`, `packages/automation-nodes/`, `packages/integration-nodes/`, and others. (The old `packages/base-nodes/src/nodes/` directory is gone — `packages/base-nodes/src/index.ts` only re-exports and aggregates, into `ALL_BASE_NODES`.) Each file exports an array of node classes (e.g., `CONTROL_NODES`, `TEXT_EXTRA_NODES`) and the package index registers them all. A class is only available once something registers it with a `NodeRegistry`. Third-party packs do that in their `register` function. See the [Custom Nodes Guide](custom-nodes-guide.md).
