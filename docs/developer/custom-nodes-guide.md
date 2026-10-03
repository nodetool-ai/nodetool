---
layout: page
title: "Custom Nodes Guide (TypeScript)"
description: "How to author, package, register, and distribute custom NodeTool nodes in a TypeScript pack."
---

This is the full guide to writing **TypeScript** custom nodes for NodeTool. [Node Patterns](node-patterns.md) and [Node Reference](node-reference.md) cover the same TypeScript API in less depth; [Node Examples](node-examples.md) covers the Python nodes reached through the Python bridge.

A custom node lives in a standalone npm package — a **pack** — that the server discovers and loads at startup. There is nothing to register by hand: drop a `nodetool` field in `package.json`, install the package, and the loader does the rest.

> **Related:** [Node Packs](../node-packs.md) (user-facing intro), [Package Registry Guide](../packages.md) (first-party package conventions), [TypeScript DSL Guide](ts-dsl-guide.md) (using nodes in code-defined workflows).

## Contents

1. [Quick start](#1-quick-start)
2. [Package layout](#2-package-layout)
3. [`package.json` and the pack manifest](#3-packagejson-and-the-pack-manifest)
4. [Trust model and governance](#4-trust-model-and-governance)
5. [`tsconfig.json`](#5-tsconfigjson)
6. [Anatomy of a node](#6-anatomy-of-a-node)
7. [The `@prop` decorator reference](#7-the-prop-decorator-reference)
8. [The type system](#8-the-type-system)
9. [Declaring outputs](#9-declaring-outputs)
10. [`ProcessingContext` — the runtime surface](#10-processingcontext--the-runtime-surface)
11. [Streaming nodes (`genProcess`)](#11-streaming-nodes-genprocess)
12. [Lifecycle hooks](#12-lifecycle-hooks)
13. [Registering nodes](#13-registering-nodes)
14. [Building the pack](#14-building-the-pack)
15. [Testing nodes](#15-testing-nodes)
16. [Installing and running the pack](#16-installing-and-running-the-pack)
17. [Versioning the pack API](#17-versioning-the-pack-api)
18. [Common pitfalls](#18-common-pitfalls)

---

## 1. Quick start

Scaffold a pack, write one node, install it, run the server:

```bash
mkdir nodetool-mypack && cd nodetool-mypack
npm init -y
npm install --save @nodetool-ai/node-sdk @nodetool-ai/runtime @nodetool-ai/protocol
npm install --save-dev typescript @types/node vitest
```

`nodetool package init` scaffolds a similar package. It writes the `nodetool` field and an empty `export function register(...)`, but its `tsconfig.json` lacks `experimentalDecorators`. Add the compiler flags from [§5](#5-tsconfigjson) before you write nodes.

`src/nodes/reverse.ts`:

```ts
import { BaseNode, prop } from "@nodetool-ai/node-sdk";

export class ReverseTextNode extends BaseNode {
  static readonly nodeType = "mypack.text.Reverse";
  static readonly title = "Reverse Text";
  static readonly description = "Reverse a string character by character.";
  static readonly metadataOutputTypes = { output: "str" };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: string;

  async process(): Promise<Record<string, unknown>> {
    return { output: [...(this.text ?? "")].reverse().join("") };
  }
}
```

`src/index.ts`:

```ts
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ReverseTextNode } from "./nodes/reverse.js";

export function register(registry: NodeRegistry): void {
  registry.register(ReverseTextNode);
}
```

Add a `nodetool` field to `package.json` (see [§3](#3-packagejson-and-the-pack-manifest)), build with `tsc`, then `npm link` (or `npm install`) into your NodeTool workspace and restart the server. The node appears in the menu as **Reverse Text** under `mypack.text`.

---

## 2. Package layout

A pack is a normal npm package. Keep one node (or a small group) per file:

```text
nodetool-mypack/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts                  # entry — exports `register(registry)`
│   └── nodes/
│       ├── reverse.ts
│       └── math.ts
└── tests/
    └── reverse.test.ts
```

Keep the public surface in `src/index.ts` minimal: re-export node classes and the `register` function. Everything else stays internal.

---

## 3. `package.json` and the pack manifest

```json
{
  "name": "@acme/cool-nodes",
  "version": "0.1.0",
  "description": "Cool custom nodes for NodeTool",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@nodetool-ai/node-sdk": "latest"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.1"
  },
  "nodetool": {
    "apiVersion": 1,
    "register": "register"
  }
}
```

The **`nodetool`** field is what makes the package a pack. At startup the loader scans installed packages, picks up any with this field, imports the resolved entry, and calls the named export with the registry.

| Field            | Default      | Meaning |
|------------------|--------------|---------|
| `apiVersion`     | `1`          | Pack API version you built against. Packs declaring a version newer than the host supports are skipped with a warning. |
| `register`       | `"register"` | Named export the loader calls with the registry. Can be `async`. The loader also looks for it on a default export object. |
| `sandboxModules` | none         | Declares guest modules for the [JavaScript sandbox](../javascript-sandbox.md). A pack that sets this field without `register` is a sandbox-only pack, and the node loader ignores it. |

> The loader uses the `"."` entry of `exports` (a string, or the `import` condition falling back to `default`, which may be nested), or `main`, or `index.js` — in that order. A `nodetool` field that fails schema validation logs a warning and the package is skipped.

**Where the loader looks.** It scans every `node_modules` directory from the working directory up to the filesystem root, plus the directories listed in `NODETOOL_OPTIONAL_NODE_MODULES` (one path) and `NODETOOL_PACK_SEARCH_PATHS` (a list separated by commas, semicolons, or the platform path separator). It then scans the root holding the sandbox packs that ship with NodeTool (`NODETOOL_SHIPPED_PACKS_DIR` overrides that root). When two directories hold a package of the same name, the first one found wins. Packs load once at server start. The `packs.reload` tRPC mutation re-runs the scan, but it cannot unload nodes that are already registered.

---

## 4. Trust model and governance

> **Custom nodes run in the server process as the server user.** They have full
> filesystem, network, secret-store, and `process.env` access, with no sandbox.
> A pack is exactly as trusted as any dependency you `npm install`. **Only
> install packs you trust.**

To avoid silently running whatever happens to be in `node_modules` in production, the loader is gated:

- **Allowlist** — a list of trusted pack names; `"*"` allows everything. Set via:
  - The env var `NODETOOL_PACKS_ALLOWLIST` (comma-separated names), which takes precedence, or
  - The `allow` field of `~/.config/nodetool/packs.json` (path overridable with the `NODETOOL_PACKS_CONFIG` env var).
- **`allowUnlisted`** — whether packs not on the allowlist load anyway. Defaults to **`true` in development** (so installing a pack just works) and **`false`** when either `NODETOOL_ENV=production` or `NODETOOL_PACKS_REQUIRE_ALLOWLIST=1` is set. The packaged desktop app sets the latter — it needs the allowlist without production mode, which would disable local-only features. Override via the `allowUnlisted` field of the config file. The `packs.getTrust` and `packs.setTrust` tRPC procedures read and write the same file, and `setTrust` does not copy an env override into it.

Two further guards protect the registry regardless of trust:

- **Reserved namespaces** — packs cannot register node types whose first dot-separated segment is one of: `nodetool`, `lib`, `comfy`, `default`, `huggingface`, `hf`, `mlx`, `transformers`, `openai`, `gemini`, `anthropic`, `mistral`, `groq`, `ollama`, `replicate`, `fal`, `elevenlabs`, `kie`, `vector`, `apify`, `search`, `messaging`. Such nodes are skipped with a warning.
- **Collision protection** — a pack cannot shadow an already-registered node type (a built-in, or a node registered earlier by another pack). The conflicting node is skipped with a warning; the original wins.

Example allowlist file:

```json
{
  "allow": ["@acme/cool-nodes", "@other-org/audio-pack"],
  "allowUnlisted": false
}
```

---

## 5. `tsconfig.json`

The SDK uses **legacy (experimental) decorators** without runtime metadata emission. Match those flags or builds will produce unusable output:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": false
  },
  "include": ["src"]
}
```

> Keep `"emitDecoratorMetadata"` set to `false`. The SDK does not read decorator metadata. Property declarations must use `declare` (see [§6](#6-anatomy-of-a-node)), which emits no field initializer and so works whatever `useDefineForClassFields` resolves to.

---

## 6. Anatomy of a node

Every node extends `BaseNode` and declares its inputs with `@prop`. The runtime assigns properties on the instance *before* calling `process()` — your method reads inputs from `this.<field>`, **not** from a parameter.

```ts
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

export class AddOffsetNode extends BaseNode {
  // ── Identity ────────────────────────────────────────────────
  static readonly nodeType = "mypack.math.AddOffset";
  static readonly title = "Add Offset";
  static readonly description = "Add a constant offset to a number.";

  // ── Output type ────────────────────────────────────────────
  static readonly metadataOutputTypes = { output: "float" };

  // ── Inputs ─────────────────────────────────────────────────
  @prop({ type: "float", default: 0.0, title: "Value" })
  declare value: number;

  @prop({ type: "float", default: 1.0, title: "Offset" })
  declare offset: number;

  // ── Execution ──────────────────────────────────────────────
  async process(_context?: ProcessingContext): Promise<Record<string, unknown>> {
    return { output: (this.value ?? 0) + (this.offset ?? 1) };
  }
}
```

### Required static members

| Member        | Type      | Purpose |
|---------------|-----------|---------|
| `nodeType`    | `string`  | Unique dotted identifier. By convention: `<namespace>.<category>.<Name>`. |
| `title`       | `string`  | Display name in the node menu. |
| `description` | `string`  | One-line tooltip. |

### Common optional static members

| Member                 | Type                              | Purpose |
|------------------------|-----------------------------------|---------|
| `metadataOutputTypes`    | `{ [name]: typeString }`          | Maps output handle name → NodeTool type string. Declare every output the node returns: a node with no declared outputs has no output handles. |
| `isStreamingInput`       | `boolean`                         | Marks the node as consuming a stream via the `run(...)` hook (pair with `inputMode = "stream"`). |
| `supportsDynamicInputs`  | `boolean`                         | Allows users to add/remove input handles in the UI; read/write them with `getDynamic` / `setDynamic`. |
| `inputMode`              | `"buffered" \| "stream" \| "controlled"` | How inputs are consumed. Default (`undefined`) is buffered. |
| `outputCorrelation`      | `{ [output]: OutputCorrelation }` | Controls per-iteration / per-chunk fan-out semantics. Streaming output is inferred from this (`forward`, `iteration`, or `chunk` kinds) or from overriding `genProcess`. There is **no** `isStreamingOutput` flag. |
| `requiredSettings`       | `string[]`                        | Secret names resolved from the secret store before the node runs. Read them from `this._secrets`. |
| `inlineFields` / `inputFields` | `string[]`                  | Which properties render compactly on the node body, and which render as expanded inputs. |
| `effect`                 | `"pure" \| "read" \| "write" \| "external"` | What running the node does to the world. Reactive runs (a slider drag, a mini app input change) execute only `pure` and `read` nodes. Default `"external"`. |
| `cacheTtl`               | `number \| "forever"`             | How long a partial run ("Run Node", "Run from here") may reuse the result. `"forever"` for pure deterministic nodes, seconds for time-sensitive ones. Default: never reuse. |
| `retrySafe`              | `boolean`                         | Opt in when re-running with identical inputs is safe. The workflow supervisor offers `retry` only for nodes that declare it. Default `false`. |
| `deprecated` / `hidden` / `replacedBy` | `boolean` / `boolean` / `string` | Lifecycle flags. `hidden` keeps the node runnable but out of discovery UIs. |
| `platforms`              | `Platform[]`                      | Deployment targets the node supports. Default `["node"]`. |

### The `process` method

```ts
abstract process(context?: ProcessingContext): Promise<Record<string, unknown>>
```

- Returns an object whose keys are **output handle names** declared in `metadataOutputTypes`.
- Reads inputs from `this.<field>`. The runtime has already populated them via `assign()`.
- The `context` parameter is optional. Many pure-compute nodes ignore it. Anything that touches secrets, storage, HTTP, or providers will use it — see [§10](#10-processingcontext--the-runtime-surface).
- Throwing an `Error` fails the node and surfaces the message to the UI. Throw `Error` objects, not strings.

> **Do not** add an `inputs` parameter — that pattern is from an older draft of this guide and does not match the runtime contract. Property assignment happens before `process()` runs.

---

## 7. The `@prop` decorator reference

`@prop` is the only decorator pack authors call directly. Outputs are declared via static class members, not decorators.

```ts
@prop(options: PropOptions)
```

| Option              | Type                              | Purpose |
|---------------------|-----------------------------------|---------|
| `type`              | `string` **(required)**           | NodeTool type string — see [§8](#8-the-type-system). |
| `default`           | `unknown`                         | Default value when no upstream input is connected. |
| `title`             | `string`                          | Display name in the UI. Defaults to the field name. |
| `description`       | `string`                          | Tooltip text. |
| `min` / `max`       | `number`                          | Bounds for numeric types — used by sliders and validation. |
| `required`          | `boolean`                         | Whether the input must be connected or set. |
| `values`            | `(string \| number)[]`            | Allowed values; renders as a dropdown / enum selector. |
| `json_schema_extra` | `Record<string, unknown>`         | Custom UI metadata (renderer hints, layout, etc.). |

Always pair `@prop` with a `declare` field — the runtime owns assignment, so emitted initializers would just be overwritten.

```ts
@prop({ type: "str", default: "", title: "Prompt", description: "What to generate" })
declare prompt: string;

@prop({ type: "float", default: 0.7, min: 0, max: 2, title: "Temperature" })
declare temperature: number;

@prop({ type: "str", default: "auto", values: ["auto", "fast", "best"], title: "Mode" })
declare mode: string;
```

---

## 8. The type system

The `type` string in `@prop` and the values in `metadataOutputTypes` come from the same vocabulary — the one shared with Python nodes.

### Scalars

| String   | TS type      |
|----------|--------------|
| `"str"`  | `string`     |
| `"int"`  | `number`     |
| `"float"`| `number`     |
| `"bool"` | `boolean`    |
| `"json"` | `unknown`    |
| `"any"`  | `unknown`    |

### Collections

| String                | TS type                          |
|-----------------------|----------------------------------|
| `"list[T]"`           | `T[]` (e.g. `list[str]`, `list[any]`) |
| `"dict[str, any]"`    | `Record<string, unknown>`        |
| `"dict[str, str]"`    | `Record<string, string>`         |

### Media references

Media flows through the graph as small reference objects, not as raw bytes. Import the types from `@nodetool-ai/node-sdk`:

`@nodetool-ai/node-sdk` re-exports only `ImageRef`, `AudioRef`, `VideoRef`,
`TextRef`, and `DataframeRef`. `DocumentRef`, `Model3DRef`, and `FolderRef` are **not**
re-exported by the SDK — import those from `@nodetool-ai/protocol`:

```ts
import type {
  ImageRef,
  AudioRef,
  VideoRef,
  TextRef,
  DataframeRef
} from "@nodetool-ai/node-sdk";
import type { DocumentRef, Model3DRef } from "@nodetool-ai/protocol";
```

| String         | TS type        | Use for |
|----------------|----------------|---------|
| `"image"`      | `ImageRef`     | Images (URI or inline bytes) |
| `"audio"`      | `AudioRef`     | Audio clips |
| `"video"`      | `VideoRef`     | Video files |
| `"document"`   | `DocumentRef`  | PDFs, Word, plain-text files |
| `"text"`       | `TextRef`      | Large text blobs by reference |
| `"dataframe"`  | `DataframeRef` | Tabular data |
| `"model_3d"`   | `Model3DRef`   | 3D meshes / glTF |
| `"folder"`     | `FolderRef`    | Asset folders |
| `"collection"` | `{ type: "collection", name }` | Vector database collections (see `vector.Collection`) |

`DocumentRef`, `Model3DRef`, and `FolderRef` come from `@nodetool-ai/protocol`.

### Model selectors

These render as model pickers in the UI:

| String              | Meaning |
|---------------------|---------|
| `"language_model"`  | An LLM (provider + model id pair). |
| `"image_model"`     | An image-generation model. |
| `"video_model"`     | A video-generation model. |
| `"tts_model"`       | A text-to-speech model. |
| `"asr_model"`       | A speech-recognition model. |
| `"embedding_model"` | An embedding model. |

### Domain types

`"date"`, `"datetime"`, `"image_size"`, `"enum"` — render with specialised inputs.

The vocabulary is open: asset and node-defined types are allowed. Use NodeTool's spellings, not JSON Schema or TypeScript ones. `integer`, `string`, `boolean`, `object`, and `array` are not types here, and a dynamic slot declared with one of them is rejected because the handle would never connect to an `int` or `str` input.

---

## 9. Declaring outputs

Single output, default name `output`:

```ts
static readonly metadataOutputTypes = { output: "str" };

async process(): Promise<Record<string, unknown>> {
  return { output: "hello" };
}
```

Multiple outputs:

```ts
static readonly metadataOutputTypes = {
  text: "str",
  tokenCount: "int"
};

async process(): Promise<Record<string, unknown>> {
  const text = this.input ?? "";
  return { text, tokenCount: text.split(/\s+/).length };
}
```

Every key returned by `process()` must be declared in `metadataOutputTypes`. The editor exposes only declared outputs as handles, so an undeclared key is unreachable downstream. A key you leave out (or set to `undefined`) sends no message on that output, and nodes wired only to it do not run. `nodetool.control.If` relies on this: it returns only `if_true` or only `if_false`.

If you do not declare `metadataOutputTypes`, the class falls back to a static `outputTypes` map, and a node with neither has no outputs.

---

## 10. `ProcessingContext` — the runtime surface

The `context` passed to `process()` and `genProcess()` is your gateway to everything the runtime owns: secrets, storage, cache, HTTP, providers, messages. You only need it when a node has side effects.

```ts
import type { ProcessingContext } from "@nodetool-ai/runtime";
```

### Identity

```ts
context.jobId;        // string — unique per workflow run
context.workflowId;   // string | null
context.userId;       // string
context.signal;       // AbortSignal — pass it to fetch and other cancellable calls
context.workspace;    // Workspace | null — the run's files (preferred)
context.workspaceDir; // string | null — deprecated, null for cloud workspaces
```

Read and write run files through `context.workspace` (`read`, `readText`, `write`, `exists`, `stat`, `list`, `copy`, `move`, `delete`) with workspace-relative paths. It works on local and cloud runs alike. `context.workspace.localDir` is `null` for a virtual (cloud) workspace. To run a host binary on a workspace file, use `materialize` and `absorb`, and `scratchDir()` for outputs.

### Secrets

```ts
const apiKey = await context.getSecret("OPENAI_API_KEY");        // string | null
const required = await context.getSecretRequired("STRIPE_KEY");  // throws if missing
```

Always prefer `getSecret` over `process.env` — secrets are user-scoped and may come from an encrypted store, not the process environment.

### HTTP helpers

```ts
const resp = await context.httpGet("https://api.example.com/data", {
  headers: { Authorization: `Bearer ${apiKey}` }
});
await context.httpRequestWithRetries("POST", url, {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ foo: 1 }),
  retry: { maxRetries: 5 }
});
```

`httpGet` is the GET shorthand. Every other verb goes through
`httpRequestWithRetries`, which carries the shared retry and backoff policy.
Options are `RequestInit` plus `retry` (`maxRetries` default 3, `backoffMs` default 500 with exponential backoff, `retryStatuses` default 408, 425, 429, 500, 502, 503, 504). A non-retryable error status throws without retrying.

These helpers do not apply SSRF protection. For a URL that a user, provider, or model chose, use `safeFetch` or `fetchExternalMedia` from `@nodetool-ai/runtime`.

### Cache

The cache is exposed at `context.cache` and is in-memory unless the host supplies another adapter. All methods are **async**.
`set` takes an optional TTL in seconds, and `get` takes only the key (it returns
`undefined` on a miss — there is no default-value argument):

```ts
// CacheAdapter signatures:
//   get<T>(key: string): Promise<T | undefined>
//   set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
//   has(key: string): Promise<boolean>
//   delete(key: string): Promise<void>
const hit = await context.cache.get<Record<string, unknown>>("my-key");
if (hit !== undefined) return hit;
const result = await expensive();
await context.cache.set("my-key", result, 3600);  // expires after 1 hour
```

For node-result memoization, the convenience helpers wrap the same cache. The key combines the user id, the node type, and a deterministic serialization of the properties. `cacheResult` defaults to a one-hour TTL:

```ts
const cached = await context.getCachedResult(this.nodeType, this.serialize());
if (cached) return cached;
const result = await expensive();
await context.cacheResult(this.nodeType, this.serialize(), result, 3600);
return result;
```

### Storage and workspace files

```ts
const uri = await context.storage.store("output.png", bytes, "image/png");
const data = await context.storage.retrieve(uri);

await context.workspace?.write("notes.txt", "hello", "text/plain");
const notes = await context.workspace?.readText("notes.txt");
```

`context.storage` is `null` when the host wires no storage adapter. `context.workspaceStorage` still exists but is deprecated in favor of `context.workspace`.

To read the bytes of an image, audio, video, or model reference, call `loadMediaRefBytes(ref, context)` from `@nodetool-ai/runtime`. It handles inline `data`, `asset://` references, storage-backed URIs, and `http(s)` URLs (through the media egress policy), and returns `null` when it finds no bytes.

### LLM providers

```ts
if (await context.isProviderConfigured("openai")) {
  const provider = await context.getProvider("openai");
  const stream = provider.streamChat({ messages, model: "gpt-5.4-mini" });
}
```

### Variables (per-job key/value scratch)

```ts
context.set("counter", 0);
const n = context.get<number>("counter", 0);
context.hasVariable("counter"); // true
```

### Messages

`context.emit(msg)` posts a `ProcessingMessage` (log line, status update, tool call, …) onto the run's event stream. The UI uses these to surface progress.

---

## 11. Streaming nodes (`genProcess`)

For nodes that produce results incrementally, override `genProcess` and declare an iteration `outputCorrelation`. The base class detects that the subclass overrides `genProcess` and iterates it — there is no `isStreamingOutput` flag to set:

```ts
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { OutputCorrelation } from "@nodetool-ai/protocol";

export class WordStreamNode extends BaseNode {
  static readonly nodeType = "mypack.text.WordStream";
  static readonly title = "Word Stream";
  static readonly description = "Emit each word of the input as a separate event.";
  static readonly metadataOutputTypes = { word: "str" };
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    word: { kind: "iteration", source: "__execution__", group: "items" },
  };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: string;

  async process(): Promise<Record<string, unknown>> {
    // Fallback for non-streaming consumers.
    return { word: this.text };
  }

  async *genProcess(
    _context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    for (const word of String(this.text ?? "").split(/\s+/)) {
      if (word) yield { word };
    }
  }
}
```

### Output correlation

`outputCorrelation` tells the runtime how each output relates to the node's inputs, so downstream nodes line up items correctly:

```ts
// metadataOutputTypes declares both outputs: { word: "str", count: "int" }
static readonly outputCorrelation = {
  word:  { kind: "iteration", source: "__execution__", group: "items" },
  count: { kind: "single",    source: "__execution__" }
};
```

| `kind`      | Meaning |
|-------------|---------|
| `single`    | One logical output per invocation. It inherits the invocation's lineage. |
| `iteration` | Each emitted value is a new logical item with its own correlation token. Outputs that share a `group` share one token per yield. |
| `chunk`     | A piece of a streamed value, such as text deltas. It inherits the base lineage. |
| `forward`   | Emits per input item and copies that item's lineage. `source` names the input handle. |
| `aggregate` | A `stream`-mode node that consumes child items and emits at a collapsed scope. Requires `collapse: "innermost"`. |

Grouped `iteration` outputs must be emitted together, so yield one object per item from `genProcess` (as `ForEach` does). Once you declare `outputCorrelation`, it needs one entry for every declared output and no entry for an undeclared one. Every entry needs a `source`, `forward` cannot use `__execution__`, and `aggregate` needs `collapse` and a non-buffered `inputMode`. `registry.register` throws a `CorrelationMetadataError` on any violation, and inside a pack that makes the whole pack fail to load. See [Correlation Design](https://github.com/nodetool-ai/nodetool/blob/main/docs/correlation-design.md) for the rules.

### Streaming inputs (`run`)

A node that consumes a stream sets `isStreamingInput = true` and `inputMode = "stream"`, and implements `run(inputs, outputs, context?)` instead of relying on `process()`. It still needs a `process()` stub because the base class requires one. `nodetool.control.Take` is a small example:

```ts
import type { StreamingInputs, StreamingOutputs } from "@nodetool-ai/node-sdk";

async run(inputs: StreamingInputs, outputs: StreamingOutputs): Promise<void> {
  for await (const item of inputs.stream("input_item")) {
    await outputs.emit("output", item);
  }
}
```

`inputs` offers `stream(name)`, `any()` (all handles in arrival order), `first(name, default?)`, and `hasStream(name)`. `outputs` offers `emit(slot, value)`, `emitGroup(values)` for grouped iteration outputs, `forward`, `drop`, and `complete(slot)` for early end-of-stream.

### Default behaviour

If you don't override `genProcess`, the base implementation yields the single result of `process()`. So a non-streaming node needs nothing extra; only streaming nodes override `genProcess`.

---

## 12. Lifecycle hooks

Override these on your class to run setup and teardown:

```ts
async initialize(): Promise<void> { /* once per node, before the run starts */ }
async preProcess(): Promise<void>  { /* once, when the node's actor starts, before its first invocation */ }
async finalize(): Promise<void>    { /* once when the node finishes, even after an error */ }
```

`initialize` runs for every node in the graph before any node executes. If one node's `initialize` throws, the run fails and the nodes already initialized are finalized. Use it for expensive one-time setup (e.g. opening a connection) and reset of per-run state, and use `finalize` to release it. `preProcess` does not run before each `process()` call, and it is rarely needed. A `finalize` error is swallowed so it cannot hide the original failure.

---

## 13. Registering nodes

Your pack's `register` function — the export named in the manifest — receives the registry and adds each node class:

```ts
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { AddOffsetNode } from "./nodes/math.js";
import { ReverseTextNode } from "./nodes/reverse.js";
import { WordStreamNode } from "./nodes/stream.js";

const ALL_NODES = [AddOffsetNode, ReverseTextNode, WordStreamNode] as const;

export function register(registry: NodeRegistry): void {
  for (const cls of ALL_NODES) {
    registry.register(cls);
  }
}
```

Things the loader will refuse — silently dropping the offending node and warning in the log:

- A `nodeType` under a [reserved namespace](#4-trust-model-and-governance).
- A `nodeType` already registered by a built-in or an earlier pack (no shadowing).

The `register` function may be `async` — useful if you build node classes from a manifest at load time. Calling `registry.register` directly (outside the loader) skips both guards and replaces an existing registration of the same type with a warning.

### What `NodeRegistry` exposes

Pack authors only need:

| Method                        | Purpose |
|-------------------------------|---------|
| `register(nodeClass, opts?)`  | Add a node class. |
| `has(nodeType)`               | Already registered? |
| `list()`                      | All registered node types. |
| `getClass(nodeType)`          | The class for a node type. |
| `listMetadata()`              | UI metadata for every registered node. |

`register` throws if the class has no `nodeType`. Everything else on the registry is for the runtime.

---

## 14. Building the pack

```bash
npm run build       # tsc → dist/
npm run lint        # tsc --noEmit
npm run test        # vitest run
```

Ship the `dist/` directory plus `package.json` and a `README.md`. Don't ship `src/` — it won't be loaded.

### Recommended `package.json` "files" allowlist

```json
"files": ["dist", "README.md", "LICENSE"]
```

---

## 15. Testing nodes

Use Vitest (same harness the SDK uses internally). The pattern for an end-to-end test:

```ts
import { describe, it, expect } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { register } from "../src/index.js";
import { ReverseTextNode } from "../src/nodes/reverse.js";

describe("ReverseTextNode", () => {
  it("registers under its nodeType", () => {
    const registry = new NodeRegistry();
    register(registry);
    expect(registry.has(ReverseTextNode.nodeType)).toBe(true);
  });

  it("reverses a string", async () => {
    const node = new ReverseTextNode({ text: "hello" });
    const result = await node.process();
    expect(result).toEqual({ output: "olleh" });
  });
});
```

For nodes that need a `ProcessingContext`, use `createFakeContext` from `@nodetool-ai/runtime`. It returns `{ context, workspaceDir, providers, cleanup }` with in-memory storage and cache, a stubbed `fetch`, and a fake provider. Pass `providers`, `secretResolver`, `fetchFn`, or `variables` to control what the node sees, and call `cleanup()` in `afterEach`:

```ts
import { createFakeContext } from "@nodetool-ai/runtime";

const handle = createFakeContext({ secretResolver: (k) => (k === "API_KEY" ? "test" : null) });
const result = await node.process(handle.context);
handle.cleanup();
```

To run one node against the real registry from the command line, use `nodetool node run <type> --props '{"text":"hello"}'`. Add `--no-secrets` for a hermetic run and `--json` for the full result. See [CLI reference](../cli.md).

### Testing streaming nodes

```ts
it("yields one event per word", async () => {
  const node = new WordStreamNode({ text: "foo bar baz" });
  const chunks: unknown[] = [];
  for await (const chunk of node.genProcess()) chunks.push(chunk);
  expect(chunks).toEqual([{ word: "foo" }, { word: "bar" }, { word: "baz" }]);
});
```

---

## 16. Installing and running the pack

For a published pack:

```bash
cd /path/to/nodetool
npm install @acme/cool-nodes
# in production, allowlist it:
echo '{ "allow": ["@acme/cool-nodes"] }' > ~/.config/nodetool/packs.json
npm run dev:server
```

For local development, `npm link` the pack so edits land without re-publishing:

```bash
cd nodetool-mypack && npm run build && npm link
cd /path/to/nodetool && npm link @acme/cool-nodes
npm run dev:server
```

The server logs which packs were discovered:

```text
Loaded node pack @acme/cool-nodes@0.1.0 (3 node(s))
Skipped node pack @other/blocked@1.0.0: not on pack allowlist
Pack @evil/shadowy: skipped node nodetool.text.Override (reserved-namespace)
Failed to load node pack @acme/broken@0.2.0: entry "…/dist/index.js" has no callable export "register"
```

The node-level skip reasons are `reserved-namespace` and `collision`. A pack-level skip reports `not on pack allowlist` or `requires pack API v2, host supports v1`. A pack that throws while loading is reported as failed and does not stop other packs. `packs.list` (tRPC) returns the same startup snapshot.

---

## 17. Versioning the pack API

The pack API is versioned with a single integer (`apiVersion`, currently `1`). Forward compatibility:

- If your pack declares `apiVersion: 2` and runs on a host that only knows `1`, the host skips it cleanly rather than crashing.
- If the host knows `2` and your pack still declares `1`, everything keeps working — the host is responsible for backward compatibility.

When the host bumps the version, the changelog will name exactly what changed and what (if anything) authors need to migrate.

---

## 18. Common pitfalls

**Property declarations without `declare`.** TypeScript will emit initializers that overwrite the values the runtime just assigned. Always:

```ts
@prop({ type: "str", default: "" })
declare text: string;     // good

@prop({ type: "str", default: "" })
text: string = "";        // bad — runs after assign()
```

**ESM `.js` extensions in imports.** With `module: "Node16"`, internal imports must use the `.js` extension (matching the compiled output), even from `.ts` source:

```ts
import { ReverseTextNode } from "./nodes/reverse.js";   // good
import { ReverseTextNode } from "./nodes/reverse";      // bad
```

**`emitDecoratorMetadata`.** Leave this `false`. The SDK does not consume runtime metadata and enabling it can produce conflicting decorator output.

**Returning an undeclared output key.** The editor offers only the handles in `metadataOutputTypes`. A key outside that map is unreachable downstream.

**Loading from `src/` instead of `dist/`.** The loader resolves the package's `exports`/`main`, which points at `dist/`. Forgetting to build before installing means the pack loads stale code (or nothing).

**Reserved-namespace `nodeType`s.** A `nodeType` of `nodetool.foo.MyNode` will be silently rejected. Use your own namespace (`mypack.foo.MyNode`, `@acme.foo.MyNode`, …).

**Collision with built-ins.** If a built-in already owns the `nodeType` you picked, your node is dropped. Pick a unique name and check the server log for `skipped node … (collision)`.

**Throwing strings instead of `Error`.** The runtime surfaces `.message` of the error it catches, so a thrown string has no message to show.

**Long-running `process` blocking the event loop.** If your work is CPU-bound, do it in a `Worker`. The server runs on a single Node.js event loop.

**Reading from `process.env` for user-scoped secrets.** Use `requiredSettings` with `this._secrets`, or `context.getSecret(key)`. Both consult the user's secret store first (which may be encrypted and is not the process environment) and then fall back to the environment.

---

## Related documentation

- [Node Packs](../node-packs.md) — user-facing intro to packs.
- [Package Registry Guide](../packages.md) — first-party package conventions.
- [Node Implementation Examples (Python)](node-examples.md) — annotated Python node examples.
- [Node Patterns](node-patterns.md) — TypeScript design patterns: multi-output, streaming, stateful, media refs, secrets.
- [Node Reference](node-reference.md) — TypeScript `@prop` / `process()` / `genProcess()` templates.
- [TypeScript DSL Guide](ts-dsl-guide.md) — use your nodes in code-defined workflows.
- [Suspendable Nodes](suspendable-nodes.md) — why there is no pause/resume node API.
