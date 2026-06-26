---
layout: page
title: "Custom Nodes Guide (TypeScript)"
description: "How to author, package, register, and distribute custom NodeTool nodes in a TypeScript pack."
---

This is the full guide to writing **TypeScript** custom nodes for NodeTool — the in-process counterpart to the Python node guides ([Node Examples](node-examples.md), [Node Patterns](node-patterns.md), [Node Reference](node-reference.md)).

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
npm install --save @nodetool-ai/node-sdk
npm install --save-dev typescript @types/node vitest
```

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

| Field        | Default      | Meaning |
|--------------|--------------|---------|
| `apiVersion` | `1`          | Pack API version you built against. Packs declaring a version newer than the host supports are skipped with a warning. |
| `register`   | `"register"` | Named export the loader calls with the registry. Can be `async`. |

> The loader uses the `"."` entry of `exports` (the `import` condition, falling back to `default`), or `main`, or `index.js` — in that order.

---

## 4. Trust model and governance

> **Custom nodes run in the server process as the server user.** They have full
> filesystem, network, secret-store, and `process.env` access, with no sandbox.
> A pack is exactly as trusted as any dependency you `npm install`. **Only
> install packs you trust.**

To avoid silently running whatever happens to be in `node_modules` in production, the loader is gated:

- **Allowlist** — a list of trusted pack names; `"*"` allows everything. Set via:
  - The env var `NODETOOL_PACKS_ALLOWLIST` (comma-separated names), or
  - The `allow` field of `~/.config/nodetool/packs.json` (path overridable with the `NODETOOL_PACKS_CONFIG` env var).
- **`allowUnlisted`** — whether packs not on the allowlist load anyway. Defaults to **`true` in development** (so installing a pack just works) and **`false` in production** (`NODETOOL_ENV=production`). Override via the config file.

Two further guards protect the registry regardless of trust:

- **Reserved namespaces** — packs cannot register node types under first-party namespaces (`nodetool.`, `lib.`, provider names like `openai.`, `replicate.`, …). Such nodes are skipped with a warning.
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

> Do **not** enable `"useDefineForClassFields"` or `"emitDecoratorMetadata"` — they conflict with the SDK's decorator protocol. Property declarations must use `declare` (see [§6](#6-anatomy-of-a-node)).

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
| `metadataOutputTypes`    | `{ [name]: typeString }`          | Maps output handle name → NodeTool type string. Required if outputs are anything other than the default `output: any`. |
| `isStreamingInput`       | `boolean`                         | Marks the node as consuming a stream via the `run(...)` hook (pair with `inputMode = "stream"`). |
| `supportsDynamicInputs`  | `boolean`                         | Allows users to add/remove input handles in the UI; read/write them with `getDynamic` / `setDynamic`. |
| `inputMode`              | `"buffered" \| "stream" \| "controlled"` | How inputs are consumed. Default (`undefined`) is buffered. |
| `outputCorrelation`      | `{ [output]: OutputCorrelation }` | Controls per-iteration / per-chunk fan-out semantics. Streaming output is inferred from this (e.g. `forward`/`iteration` kinds) — there is **no** `isStreamingOutput` flag. |

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
`TextRef`, and `DataframeRef`. `DocumentRef` and `Model3DRef` are **not**
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

Output keys returned by `process()` must match keys in `metadataOutputTypes` — extra keys are dropped, missing keys produce `undefined` on the wire.

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
context.workspaceDir; // string | null — per-job scratch dir
```

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
await context.httpPost(url, { json: { foo: 1 } });
// Also: httpPut, httpPatch, httpDelete, httpHead
```

### Cache

The per-job cache is exposed at `context.cache`. Both methods are **async**;
`set` takes an optional TTL in seconds, and `get` takes only the key (it returns
`undefined` on a miss — there is no default-value argument):

```ts
// CacheAdapter signatures:
//   get(key: string): Promise<unknown | undefined>
//   set(key: string, value: unknown, ttlSeconds?: number): Promise<void>
const hit = await context.cache.get("my-key");
if (hit !== undefined) return hit as Record<string, unknown>;
const result = await expensive();
await context.cache.set("my-key", result, 3600);  // expires after 1 hour
```

For node-result memoization, the convenience helpers wrap the same cache:

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

await context.workspaceStorage.store("notes.txt", "hello", "text/plain");
```

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

When a streaming node mixes per-item outputs with aggregate ones, declare `outputCorrelation` so the runtime knows how to fan downstream nodes:

```ts
static readonly outputCorrelation = {
  word:  { kind: "iteration", source: "__execution__", group: "items" },
  count: { kind: "single",    source: "__execution__" }
};
```

`kind: "iteration"` means each yielded value advances downstream consumers; `kind: "single"` means the value is the run's final aggregate. See the `OutputCorrelation` type in `@nodetool-ai/protocol` for the full vocabulary.

### Default behaviour

If you don't override `genProcess`, the base implementation yields the single result of `process()`. So a non-streaming node needs nothing extra; only streaming nodes override `genProcess`.

---

## 12. Lifecycle hooks

Override these on your class to run setup and teardown:

```ts
async initialize(): Promise<void> { /* once when the node enters the run */ }
async preProcess(): Promise<void>  { /* before every process()/genProcess() */ }
async finalize(): Promise<void>    { /* once when the node leaves the run */ }
```

Use `initialize` for expensive one-time setup (e.g. opening a connection) and `finalize` to release it. `preProcess` is called per execution and is rarely needed.

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

The `register` function may be `async` — useful if you build node classes from a manifest at load time.

### What `NodeRegistry` exposes

Pack authors only need:

| Method                        | Purpose |
|-------------------------------|---------|
| `register(nodeClass, opts?)`  | Add a node class. |
| `has(nodeType)`               | Already registered? |
| `list()`                      | All registered node types. |
| `getClass(nodeType)`          | The class for a node type. |
| `listMetadata()`              | UI metadata for every registered node. |

Everything else on the registry is for the runtime.

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

For nodes that need a `ProcessingContext`, build a minimal one with the constructor options shown in [§10](#10-processingcontext--the-runtime-surface) or use a test double that stubs only the methods your node calls.

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
```

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

**Loading from `src/` instead of `dist/`.** The loader resolves the package's `exports`/`main`, which points at `dist/`. Forgetting to build before installing means the pack loads stale code (or nothing).

**Reserved-namespace `nodeType`s.** A `nodeType` of `nodetool.foo.MyNode` will be silently rejected. Use your own namespace (`mypack.foo.MyNode`, `@acme.foo.MyNode`, …).

**Collision with built-ins.** If a built-in already owns the `nodeType` you picked, your node is dropped. Pick a unique name or run `nodetool workflows list --json` and grep to be sure.

**Throwing strings instead of `Error`.** The runtime wraps errors and surfaces `.message`; a thrown string becomes `undefined` in the log.

**Long-running `process` blocking the event loop.** If your work is CPU-bound, do it in a `Worker` or via `code-runners`. The server is single-threaded.

**Reading from `process.env` for user-scoped secrets.** Use `context.getSecret(key)` — it consults the user's secret store, which may be encrypted and is not the process environment.

---

## Related documentation

- [Node Packs](../node-packs.md) — user-facing intro to packs.
- [Package Registry Guide](../packages.md) — first-party package conventions.
- [Node Implementation Examples (Python)](node-examples.md) — annotated Python node examples.
- [Node Patterns (Python)](node-patterns.md) — design patterns shared across languages.
- [Node Reference (Python)](node-reference.md) — exhaustive Python API reference.
- [TypeScript DSL Guide](ts-dsl-guide.md) — use your nodes in code-defined workflows.
- [Suspendable Nodes](suspendable-nodes.md) — long-running and resumable patterns.
