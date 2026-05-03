---
layout: page
title: "Node Implementation Quick Reference"
description: "Copy-paste templates and common patterns for building TypeScript nodes with @prop, process(), and genProcess()."
---

## Essential Node Templates

```ts
import { BaseNode, prop } from "@nodetool-ai/node-sdk";


// SIMPLE PROCESSING NODE
export class SimpleNode extends BaseNode {
  static readonly nodeType = "mypackage.example.Simple";
  static readonly title = "Simple Node";
  static readonly description =
    "Clear description of what this node does.\n" +
    "    keyword1, keyword2, keyword3";

  static readonly metadataOutputTypes = {
    output: "str",
  };

  @prop({ type: "str", default: "", title: "Input Value", description: "Help text" })
  declare input_value: any;

  @prop({ type: "int", default: 100, title: "Threshold", min: 0, max: 255 })
  declare threshold: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const value = String(inputs.input_value ?? this.input_value ?? "");
    return { output: `Result: ${value}` };
  }
}


// MULTI-OUTPUT NODE
export class MultiOutputNode extends BaseNode {
  static readonly nodeType = "mypackage.example.MultiOutput";
  static readonly title = "Multi Output";
  static readonly description = "Produces multiple outputs.\n    multi, output";

  static readonly metadataOutputTypes = {
    if_true: "any",
    if_false: "any",
  };

  static readonly isStreamingOutput = true;

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


// STREAMING / GENERATOR NODE
export class StreamingNode extends BaseNode {
  static readonly nodeType = "mypackage.example.Streaming";
  static readonly title = "Streaming Node";
  static readonly description = "Emit multiple items.\n    stream, iterate";

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


// STATEFUL COLLECTOR NODE
export class CollectorNode extends BaseNode {
  static readonly nodeType = "mypackage.example.Collector";
  static readonly title = "Collector";
  static readonly description = "Collect streamed items.\n    collect, aggregate";

  static readonly metadataOutputTypes = {
    output: "list[any]",
  };

  static readonly syncMode = "on_any" as const;

  private _items: unknown[] = [];

  @prop({ type: "any", default: [], title: "Input Item" })
  declare input_item: any;

  async initialize(): Promise<void> {
    this._items = [];
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if ("input_item" in inputs) {
      this._items.push(inputs.input_item);
    }
    return { output: [...this._items] };
  }
}
```

## Common @prop Patterns

```ts
// Text input
@prop({ type: "str", default: "", title: "Text" })
declare text: any;

@prop({ type: "str", default: "", title: "Text", description: "Help text" })
declare text: any;

// Number with constraints
@prop({ type: "int", default: 0, title: "Count", min: 0, max: 100 })
declare count: any;

@prop({ type: "float", default: 0.5, title: "Threshold", min: 0.0, max: 1.0 })
declare threshold: any;

// Boolean
@prop({ type: "bool", default: false, title: "Enabled" })
declare enabled: any;

// Optional (nullable)
@prop({ type: "str", default: null, title: "Label" })
declare label: any;

// List
@prop({ type: "list[str]", default: [], title: "Tags", description: "List of tags" })
declare tags: any;

@prop({ type: "list[any]", default: [], title: "Items" })
declare items: any;

// Enum choices (dropdown in UI)
@prop({
  type: "enum",
  default: "option_a",
  title: "Choice",
  values: ["option_a", "option_b", "option_c"],
})
declare choice: any;

// Model selections
@prop({ type: "language_model", default: null, title: "Model", required: true })
declare model: any;

@prop({ type: "image_model", default: null, title: "Image Model", required: true })
declare image_model: any;

@prop({ type: "tts_model", default: null, title: "TTS Model", required: true })
declare tts_model: any;

// Asset references
@prop({ type: "image", default: { type: "image", uri: "", data: null }, title: "Image" })
declare image: any;

@prop({ type: "audio", default: { type: "audio", uri: "", data: null }, title: "Audio" })
declare audio: any;

@prop({ type: "video", default: { type: "video", uri: "", data: null }, title: "Video" })
declare video: any;

@prop({ type: "document", default: { type: "document", uri: "", data: null }, title: "Document" })
declare document: any;

@prop({ type: "folder", default: { type: "folder", uri: "" }, title: "Folder" })
declare folder: any;

// Data structures
@prop({ type: "dataframe", default: { type: "dataframe", uri: "", data: null }, title: "Data" })
declare dataframe: any;

@prop({ type: "dict[str, any]", default: {}, title: "Config" })
declare config: any;
```

## ProcessingContext Essentials

The optional second argument to `process()` is a **`ProcessingContext`** from `@nodetool-ai/runtime`. It provides access to secrets, provider predictions, and runtime services.

```ts
import type { ProcessingContext } from "@nodetool-ai/runtime";

async process(
  inputs: Record<string, unknown>,
  context?: ProcessingContext
): Promise<Record<string, unknown>> {

  // Access injected secrets (requires static requiredSettings)
  const apiKey =
    (inputs._secrets as Record<string, string>)?.MY_API_KEY ||
    process.env.MY_API_KEY ||
    "";

  // Run a provider prediction (image generation, TTS, etc.)
  if (context && typeof context.runProviderPrediction === "function") {
    const output = await context.runProviderPrediction({
      provider: "openai",
      capability: "text_to_image",
      model: "dall-e-3",
      params: { prompt: "a cat" },
    });
  }

  // Stream a provider prediction (e.g., TTS chunks)
  if (context && typeof context.streamProviderPrediction === "function") {
    for await (const chunk of context.streamProviderPrediction({
      provider: "openai",
      capability: "text_to_speech",
      model: "tts-1",
      params: { text: "hello" },
    })) {
      // process each chunk
    }
  }

  // Resolve a secret manually
  if (context && typeof context.getSecret === "function") {
    const secret = await context.getSecret("SOME_KEY");
  }

  return { output: result };
}
```

### Working with Media Bytes

Nodes handle media as ref objects. Extract bytes, process them, and return a new ref:

```ts
// Image: load bytes from ref
async function imageBytesAsync(image: unknown): Promise<Uint8Array> {
  if (!image || typeof image !== "object") return new Uint8Array();
  const ref = image as { uri?: string; data?: Uint8Array | string };
  if (ref.data) {
    return ref.data instanceof Uint8Array
      ? ref.data
      : Uint8Array.from(Buffer.from(ref.data as string, "base64"));
  }
  if (ref.uri) {
    const res = await fetch(ref.uri);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new Uint8Array();
}

// Image: create ref from bytes
function imageRef(data: Uint8Array, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return { data: Buffer.from(data).toString("base64"), ...extras };
}

// Audio: same pattern
function audioRefFromBytes(data: Uint8Array, uri?: string): Record<string, unknown> {
  return { uri: uri ?? "", data: Buffer.from(data).toString("base64") };
}
```

## Static Class Properties

```ts
// Declare output types (required for UI connectors)
static readonly metadataOutputTypes = { output: "str", count: "int" };

// Make available to agents
static readonly exposeAsTool = true;

// Enable dynamic input connectors
static readonly isDynamic = true;

// Support dynamic output slots
static readonly supportsDynamicOutputs = true;

// Stream output to downstream nodes one-at-a-time
static readonly isStreamingOutput = true;

// Accept streaming input
static readonly isStreamingInput = true;

// Control when the node fires
static readonly syncMode = "zip_all" as const;   // wait for all inputs (default)
static readonly syncMode = "on_any" as const;     // fire on any single input

// Declare required secrets
static readonly requiredSettings = ["OPENAI_API_KEY"];

// Set basic fields shown first in UI
static readonly basicFields = ["prompt", "model"];
```

## Lifecycle Hooks

```ts
// Called once at the start of a workflow run -- reset state here
async initialize(): Promise<void> {
  this._items = [];
}

// Called before each process() invocation
async preProcess(): Promise<void> {}

// Called after all processing is complete
async finalize(): Promise<void> {}
```

## Return Type Patterns

```ts
// Single output
async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
  return { output: "result" };
}

// Multiple outputs
async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
  return { text: "hello", score: 0.95 };
}

// Streaming (generator)
async *genProcess(
  inputs: Record<string, unknown>
): AsyncGenerator<Record<string, unknown>> {
  for (const item of items) {
    yield { output: item, index: i };
  }
}
```

## Input Node Quick List

```text
StringInput           - Text value
IntegerInput          - Whole number (min/max)
FloatInput            - Decimal (min/max)
BooleanInput          - True/False toggle
StringListInput       - List of strings

LanguageModelInput    - Select LLM
ImageModelInput       - Select image model

ImageInput            - Image asset reference
AudioInput            - Audio asset reference
VideoInput            - Video asset reference
DocumentInput         - Document asset reference
AssetFolderInput      - Folder asset reference
ColorInput            - Color picker
CollectionInput       - Vector DB collection

FolderPathInput       - Local folder path
FilePathInput         - Local file path
DocumentFileInput     - Load document from file
```

## Output Node Quick List

```text
Output                - Generic output for any data type
```

## Docstring Keywords by Category

**Data Types**
text, string, number, integer, float, boolean, list, array, dict, object, document, file

**Operations**
extract, filter, map, reduce, merge, split, join, sort, group, aggregate, transform, analyze

**Media**
image, picture, visual, video, audio, sound, document, file, folder, asset

**AI/ML**
model, embedding, classification, clustering, generation, language, agent, tool

**Control**
flow, condition, loop, iterator, generator, stream, branch, switch

**I/O**
input, output, load, save, read, write, import, export, download, upload

## Testing Pattern

```ts
// packages/base-nodes/src/nodes/my-nodes.ts
export class MyNode extends BaseNode {
  static readonly nodeType = "mypackage.MyNode";
  static readonly title = "My Node";
  static readonly description = "My node.\n    keywords";

  static readonly metadataOutputTypes = { output: "str" };

  @prop({ type: "str", default: "", title: "Value" })
  declare value: any;

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    return { output: String(inputs.value ?? this.value ?? "").toUpperCase() };
  }
}

// tests/my-nodes.test.ts
import { describe, it, expect } from "vitest";
import { MyNode } from "../src/nodes/my-nodes.js";

describe("MyNode", () => {
  it("uppercases input", async () => {
    const node = new MyNode({ value: "hello" });
    const result = await node.process({ value: "hello" });
    expect(result.output).toBe("HELLO");
  });
});
```

## Key Reminders

1. All `process()` and `genProcess()` methods must be **async**
2. Always declare **`metadataOutputTypes`** -- it drives the UI output connectors
3. Use **`@prop`** for every input -- it provides validation, defaults, and UI hints
4. Resolve inputs with `inputs.field ?? this.field ?? default`
5. Return a plain object whose keys match the `metadataOutputTypes` keys
6. Use **`genProcess()`** with `yield` for streaming outputs
7. Use **`initialize()`** to reset state in stateful / collector nodes
8. Declare **`requiredSettings`** for API keys; read them from `inputs._secrets`
9. Node discovery is automatic when classes are registered in the package index
10. Test with `vitest` -- nodes are plain classes, easy to instantiate and call
