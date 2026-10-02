---
layout: page
title: "Node Implementation Quick Reference"
description: "Copy-paste templates and common patterns for building TypeScript nodes with @prop, process(), and genProcess()."
---

## Essential Node Templates

```ts
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";


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

  async process(): Promise<Record<string, unknown>> {
    return { output: `Result: ${String(this.input_value ?? "")}` };
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

  // Forward correlation: both outputs carry the `value` input's correlation
  // token unchanged. Streaming behavior is inferred from this — there is no
  // isStreamingOutput flag.
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    if_true: { kind: "forward", source: "value" },
    if_false: { kind: "forward", source: "value" },
  };

  @prop({ type: "bool", default: false, title: "Condition" })
  declare condition: any;

  @prop({ type: "any", default: [], title: "Value" })
  declare value: any;

  // Return only the taken branch. A missing key sends nothing on that
  // output, so nodes wired only to it do not run.
  async process(): Promise<Record<string, unknown>> {
    if (this.condition) {
      return { if_true: this.value };
    }
    return { if_false: this.value };
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

  // Each yielded item is a new correlated value (iteration). genProcess()
  // is detected automatically — no isStreamingOutput flag.
  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "iteration", source: "__execution__", group: "items" },
    index: { kind: "iteration", source: "__execution__", group: "items" },
  };

  @prop({ type: "list[any]", default: [], title: "Input List" })
  declare input_list: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const values = (this.input_list ?? []) as unknown[];
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

  private _items: unknown[] = [];

  @prop({ type: "any", default: [], title: "Input Item" })
  declare input_item: any;

  async initialize(): Promise<void> {
    this._items = [];
  }

  async process(): Promise<Record<string, unknown>> {
    this._items.push(this.input_item);
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

The optional argument to `process()` and `genProcess()` is a **`ProcessingContext`** from `@nodetool-ai/runtime`. It provides access to provider predictions, secrets, storage, the workspace, the cache, and HTTP helpers. See the [Custom Nodes Guide §10](custom-nodes-guide.md#10-processingcontext--the-runtime-surface) for the full surface. Property values for declared `@prop` fields are assigned to `this` before `process()` is called — read them directly from `this.<field>`.

```ts
import type { ProcessingContext } from "@nodetool-ai/runtime";

async process(context?: ProcessingContext): Promise<Record<string, unknown>> {

  // Access injected secrets (requires static requiredSettings).
  // The base class resolves keys from context and exposes them on this._secrets.
  const apiKey = this._secrets.MY_API_KEY ?? process.env.MY_API_KEY ?? "";

  // Run a provider prediction (image generation, TTS, etc.)
  if (context) {
    const output = await context.runProviderPrediction({
      provider: "openai",
      capability: "text_to_image",
      model: "gpt-image-1",
      params: { prompt: "a cat" },
    });
  }

  // Stream a provider prediction (e.g., TTS chunks)
  if (context) {
    for await (const chunk of context.streamProviderPrediction({
      provider: "openai",
      capability: "text_to_speech",
      model: "tts-1",
      params: { text: "hello" },
    })) {
      // process each chunk
    }
  }

  // Resolve a secret manually (returns null when missing)
  if (context) {
    const secret = await context.getSecret("SOME_KEY");
  }

  return { output: "result" };
}
```

### Working with Media Bytes

Nodes handle media as ref objects. Extract bytes, process them, and return a new ref:

```ts
import { imageRefFromBytes, loadMediaRefBytes } from "@nodetool-ai/runtime";

// Load bytes from any ref: inline data, asset://, storage URIs, http(s)
const bytes = await loadMediaRefBytes(this.image, context); // Uint8Array | null

// Create an image ref from encoded bytes (sets type, base64 data, MIME, size)
const ref = await imageRefFromBytes(outputBytes);
```

`loadMediaRefBytes(ref, context?)` returns `null` when it finds no bytes, so check the result. Reading `ref.data` or calling `fetch(ref.uri)` directly misses `asset://` references. Audio and video have helpers in their packages, such as `audioBytesAsync` and `audioRefFromBytes` in `packages/audio-nodes`.

## Static Class Properties

```ts
// Declare output types (required for UI connectors). Every key a node
// returns must be declared here.
static readonly metadataOutputTypes = { output: "str", count: "int" };

// Enable dynamic (user-added) input connectors. Read/write extra inputs at
// runtime with this.getDynamic(key) / this.setDynamic(key, value).
static readonly supportsDynamicInputs = true;

// Support dynamic output slots
static readonly supportsDynamicOutputs = true;

// Restrict which types a user may pick for a dynamic input slot
static readonly allowedDynamicSlotTypes = [{ type: "str", type_args: [] }, { type: "int", type_args: [] }];

// Field split for the UI: inlineFields render compactly on the node body;
// inputFields render as the larger expanded inputs.
static readonly inlineFields = ["prompt"];
static readonly inputFields = ["model"];

// Input consumption mode (default is undefined → buffered):
//   "buffered"   — collect a matched set of inputs, call process() once
//   "stream"     — consume inputs as an async stream via run()
//   "controlled" — node runs when control events arrive (see isControlled)
static readonly inputMode = "buffered";

// Accept streaming input (used together with inputMode = "stream")
static readonly isStreamingInput = true;

// Per-output correlation. Drives scheduling and whether an output streams.
//   forward   — output carries the source input's correlation token unchanged
//   iteration — each emitted value is a fresh correlated item
//   aggregate — collapse a stream into one value
//   single    — one value per invocation, not correlated to a source
static readonly outputCorrelation = {
  output: { kind: "forward", source: "value" },
};

// Declare required secrets — injected onto this._secrets
static readonly requiredSettings = ["OPENAI_API_KEY"];

// Run-planning hints
static readonly effect = "pure";       // "pure" | "read" | "write" | "external" (default "external")
static readonly cacheTtl = "forever";  // reuse results of partial runs: "forever" or seconds
static readonly retrySafe = true;      // re-running with identical inputs is safe
static readonly platforms = ["node"];  // deployment targets (default ["node"])
```

> There is no `isStreamingOutput`, `syncMode`, `isDynamic`, or `basicFields`
> static field. Streaming is inferred from `outputCorrelation` (and from
> defining `genProcess()`/`run()`); dynamic inputs use `supportsDynamicInputs`;
> the field split uses `inlineFields`/`inputFields`.

## Lifecycle Hooks

```ts
// Called once per node before the run starts -- reset state here
async initialize(): Promise<void> {
  this._items = [];
}

// Called once when the node's actor starts, before its first invocation
// (not before every process() call)
async preProcess(): Promise<void> {}

// Called when the node finishes, including after an error
async finalize(): Promise<void> {}
```

## Return Type Patterns

```ts
// Single output
async process(): Promise<Record<string, unknown>> {
  return { output: "result" };
}

// Multiple outputs
async process(): Promise<Record<string, unknown>> {
  return { text: "hello", score: 0.95 };
}

// Streaming (generator)
async *genProcess(): AsyncGenerator<Record<string, unknown>> {
  for (const [i, item] of items.entries()) {
    yield { output: item, index: i };
  }
}
```

## Input Node Quick List

Types in the `nodetool.input` namespace (`packages/core-nodes/src/nodes/input.ts`). The generated catalog under `docs/nodes/nodetool/input/` documents each one.

```text
StringInput           - Text value
IntegerInput          - Whole number (min/max)
FloatInput            - Decimal (min/max)
BooleanInput          - True/False toggle
SelectInput           - Choice from a fixed set of options
ColorInput            - Color picker
ImageSizeInput        - Image width and height
ValueInput            - Any value, passed through unconverted

StringListInput       - List of strings
TextListInput         - List of text values
ImageListInput        - List of images
AudioListInput        - List of audio clips
VideoListInput        - List of videos

LanguageModelInput    - Select LLM
ImageModelInput       - Select image model
VideoModelInput       - Select video model
TTSModelInput         - Select text-to-speech model
ASRModelInput         - Select speech-recognition model
EmbeddingModelInput   - Select embedding model
HuggingFaceModelInput - Select a Hugging Face model

ImageInput            - Image asset reference
AudioInput            - Audio asset reference
VideoInput            - Video asset reference
DocumentInput         - Document asset reference
Model3DInput          - 3D model asset reference
DataframeInput        - Tabular data
AssetFolderInput      - Folder asset reference

FolderPathInput       - Local folder path
FilePathInput         - Local file path
DocumentFileInput     - Load document from file

MessageInput          - Chat message
MessageListInput      - List of chat messages
MessageDeconstructor  - Split a message into its fields
RealtimeAudioInput    - Live audio stream
```

Vector collections come from `vector.Collection`, not an input node.

## Output Node Quick List

```text
nodetool.output.Output                 - Named output for any data type
nodetool.workflows.base_node.Preview   - Show values inside the graph
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
// packages/<your-pkg>/src/nodes/my-nodes.ts
export class MyNode extends BaseNode {
  static readonly nodeType = "mypackage.MyNode";
  static readonly title = "My Node";
  static readonly description = "My node.\n    keywords";

  static readonly metadataOutputTypes = { output: "str" };

  @prop({ type: "str", default: "", title: "Value" })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: String(this.value ?? "").toUpperCase() };
  }
}

// tests/my-nodes.test.ts
import { describe, it, expect } from "vitest";
import { MyNode } from "../src/nodes/my-nodes.js";

describe("MyNode", () => {
  it("uppercases input", async () => {
    const node = new MyNode({ value: "hello" });
    const result = await node.process();
    expect(result.output).toBe("HELLO");
  });
});
```

For nodes that read the context, build one with `createFakeContext()` from `@nodetool-ai/runtime` and pass `handle.context` to `process()`. To run a single registered node from the shell, use `nodetool node run mypackage.MyNode --props '{"value":"hello"}'`.

## Key Reminders

1. All `process()` and `genProcess()` methods must be **async**
2. Always declare **`metadataOutputTypes`** -- it drives the UI output connectors
3. Use **`@prop`** for every input -- it provides validation, defaults, and UI hints
4. Read input values from `this.<field>` -- the engine assigns them before `process()` runs
5. Return a plain object whose keys are declared in `metadataOutputTypes` (omit a key to send nothing on that output)
6. Use **`genProcess()`** with `yield` for streaming outputs
7. Use **`initialize()`** to reset state in stateful / collector nodes
8. Declare **`requiredSettings`** for API keys; read them from `this._secrets`
9. A class exists to the runtime only after something registers it. Packs do that in their `register` function
10. Test with `vitest` -- nodes are plain classes, easy to instantiate and call
