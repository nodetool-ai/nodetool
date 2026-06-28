---
layout: page
title: "HuggingFace: Add Models & Nodes"
description: "How to add new HuggingFace Inference Providers models and hand-written nodes to NodeTool."
---

> **Audience:** coding agents and contributors who need to add new HuggingFace models or node types to NodeTool.

For user-facing docs (setup, authentication, example workflows) see [docs/huggingface.md](../../huggingface.md).

---

## TL;DR

**New model in an existing task** — nothing to do. Models are discovered live from the HF Hub API; any warm inference model for a given pipeline tag appears automatically.

**New node type** — add a `BaseNode` subclass to `packages/huggingface-nodes/src/nodes/<modality>.ts`, export it in the modality's array and `src/index.ts`, add its type to `registration.test.ts`, run `npm run build:packages && npm run test --workspace=packages/huggingface-nodes`.

---

## Where things live

| Concern | Path |
|---|---|
| Provider class (model discovery + API calls) | `packages/runtime/src/providers/huggingface-provider.ts` |
| Provider registration + secret key | `packages/runtime/src/providers/index.ts` (line 236) |
| Provider ID constant | `packages/protocol/src/api-types.ts` — `PROVIDER_IDS.HUGGINGFACE = "huggingface"` |
| Shared HTTP helpers (fetch, auth, binary handling) | `packages/huggingface-nodes/src/huggingface-base.ts` |
| Node implementations — text/NLP | `packages/huggingface-nodes/src/nodes/text.ts` |
| Node implementations — image/vision | `packages/huggingface-nodes/src/nodes/image.ts` |
| Node implementations — audio | `packages/huggingface-nodes/src/nodes/audio.ts` |
| Node implementations — video | `packages/huggingface-nodes/src/nodes/video.ts` |
| Package entry + registration helper | `packages/huggingface-nodes/src/index.ts` |
| Node tests (unit, registration) | `packages/huggingface-nodes/tests/` |

---

## How HuggingFace models and nodes work

### Two separate concerns

NodeTool has two different HuggingFace integration points that serve different purposes.

**`HuggingFaceProvider`** (in `packages/runtime/`) is the AI-provider abstraction used by agent nodes, chat, and workflow LLM nodes. It wraps the `@huggingface/inference` SDK and implements the standard `BaseProvider` interface — `generateMessage`, `textToImage`, `textToSpeech`, etc.

**`packages/huggingface-nodes/`** is a separate node package that talks to the HuggingFace Inference Providers API directly over `fetch` (no SDK dependency). These nodes cover the full set of HF Inference pipeline tasks, including NLP tasks the provider abstraction does not expose.

Both use `HF_TOKEN` from the NodeTool secrets store.

### Model discovery (provider side)

`HuggingFaceProvider` does **not** use a static model list. It queries `https://huggingface.co/api/models` at runtime, filtered to `inference=warm` models sorted by likes, one per pipeline tag:

| `getAvailable*()` method | HF pipeline tag queried |
|---|---|
| `getAvailableLanguageModels` | `text-generation` |
| `getAvailableImageModels` | `text-to-image` |
| `getAvailableVideoModels` | `text-to-video` |
| `getAvailableTTSModels` | `text-to-speech` |
| `getAvailableASRModels` | `automatic-speech-recognition` |
| `getAvailableEmbeddingModels` | `feature-extraction` |

Results are cached for 10 minutes (`CACHE_TTL_MS = 10 * 60 * 1000`). Any model that becomes warm on the Hub appears automatically in the next request.

### Node transport (node-package side)

All node API calls go to `https://router.huggingface.co`:

- **Chat/LLM tasks**: `POST /v1/chat/completions` (OpenAI-compatible)
- **All other pipeline tasks**: `POST /hf-inference/models/{model}` with a `{ inputs, parameters }` body

Helpers in `huggingface-base.ts`:

- `hfChatCompletion(token, body)` — chat completions
- `hfPipelineJson<T>(token, model, body)` — pipeline tasks returning JSON
- `hfPipelineBinary(token, model, body)` — pipeline tasks returning raw media bytes (image/video)
- `refToBase64(ref, context)` — resolve an image/audio `MediaRef` to a base64 string for API input
- `imageRefFromBytes(bytes, mimeType)` / `videoRefFromBytes(bytes, mimeType)` — wrap output bytes into a `MediaRef`-shaped object
- `cleanParams(params)` — strip `null`/`undefined` entries from a parameters object

---

## Add a new model

If the model runs a pipeline task that already has a node (or that the provider already supports), nothing needs changing. The model can be typed into the node's `model` field directly, or it will appear in provider model lists once it goes warm on the Hub.

If the model needs a **new node type** (new task or new output shape), follow the steps below.

---

## Add a new node

### 1. Choose the right modality file

| Task type | File |
|---|---|
| Text / NLP | `packages/huggingface-nodes/src/nodes/text.ts` |
| Image / vision | `packages/huggingface-nodes/src/nodes/image.ts` |
| Audio | `packages/huggingface-nodes/src/nodes/audio.ts` |
| Video | `packages/huggingface-nodes/src/nodes/video.ts` |

### 2. Implement the node class

Copy the shape of an existing node in the same file. Below is an annotated skeleton for a JSON-output pipeline task:

```typescript
// packages/huggingface-nodes/src/nodes/text.ts  (example addition)
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { cleanParams, getHfToken, hfPipelineJson } from "../huggingface-base.js";

export class MySentenceSimilarityNode extends BaseNode {
  // Required statics —————————————————————————————————————————————
  static readonly nodeType = "huggingface.MySentenceSimilarity";   // unique ID
  static readonly title = "My Sentence Similarity";
  static readonly description =
    "Compute similarity between a query and a list of sentences.\n" +
    "text, similarity, sentence-transformers, embedding, huggingface\n\n" +
    "Use cases:\n" +
    "- Semantic search\n" +
    "- Duplicate detection";
  static readonly inlineFields = ["source_sentence"];              // shown in node body
  static readonly requiredSettings = ["HF_TOKEN"];                 // always include this
  static readonly metadataOutputTypes = { output: "list" };        // declare output shape

  // Properties (one @prop per input) ————————————————————————————
  @prop({
    type: "str",
    default: "sentence-transformers/all-MiniLM-L6-v2",
    title: "Model",
    description: "Sentence-similarity model repo id."
  })
  declare model: string;

  @prop({ type: "str", default: "", title: "Source Sentence", description: "Query sentence." })
  declare source_sentence: string;

  @prop({ type: "str", default: "", title: "Sentences", description: "Newline-separated sentences to compare." })
  declare sentences: string;

  // process() calls the HF Inference API ————————————————————————
  async process(): Promise<Record<string, unknown>> {
    const token = getHfToken(this._secrets);
    const source = String(this.source_sentence ?? "");
    if (!source) throw new Error("Source sentence cannot be empty");

    const items = String(this.sentences ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const result = await hfPipelineJson<number[]>(
      token,
      String(this.model ?? "sentence-transformers/all-MiniLM-L6-v2"),
      { inputs: { source_sentence: source, sentences: items } }
    );

    return { output: result };
  }
}
```

For binary output (image or video), use `hfPipelineBinary` and wrap the result with `imageRefFromBytes` or `videoRefFromBytes`. See `TextToImageNode` in `image.ts` for the full pattern.

For audio input, resolve the `MediaRef` with `refToBase64(ref, context)` — the `process()` method must accept `context` as its first argument and forward it. See `AutomaticSpeechRecognitionNode` in `audio.ts`.

**`@prop` type values:** `"str"` `"int"` `"float"` `"bool"` `"enum"` `"image"` `"audio"` `"video"` `"dict"` `"list"`

### 3. Export the new class

In the same modality file, add the class to the exported array:

```typescript
// packages/huggingface-nodes/src/nodes/text.ts — at the bottom
export const HUGGINGFACE_TEXT_NODES: readonly NodeClass[] = [
  ChatCompletionNode,
  // ... existing nodes ...
  MySentenceSimilarityNode   // ← add here
];
```

No changes needed to `src/index.ts` — it re-exports the modality arrays.

### 4. Update the registration test

Open `packages/huggingface-nodes/tests/registration.test.ts` and add the new type to `EXPECTED_NODE_TYPES`:

```typescript
const EXPECTED_NODE_TYPES = [
  // ... existing types ...
  "huggingface.MySentenceSimilarity"   // ← add here
];
```

### 5. Add a unit test (recommended)

Add a `describe` block in `packages/huggingface-nodes/tests/nodes.test.ts`. Mock `fetch` to return a fixture, construct the node via `new MySentenceSimilarityNode({...})`, call `process()`, and assert on the output. See existing tests in that file for the pattern.

---

## Verify

```bash
# 1. Build the package (huggingface-nodes loads from dist/)
npm run build:packages

# 2. Run the package tests
npm run test --workspace=packages/huggingface-nodes

# 3. Typecheck + lint across all packages
npm run typecheck
npm run lint

# 4. Smoke-test the new node (replace type and props)
npm run dev:nodetool -- node run huggingface.MySentenceSimilarity \
  --props '{"source_sentence":"hello","sentences":"world\nhi there"}' \
  --no-secrets

# 5. Full check
npm run check
```

If the smoke-test hits a real HF endpoint (i.e., `HF_TOKEN` is set), it calls the router at `https://router.huggingface.co/hf-inference/models/<model>`. For a hermetic run, pass `--no-secrets` and mock the network in tests.

---

## How past commits did it

The `huggingface-nodes` package and `HuggingFaceProvider` were both introduced in commit **`d1491abf`** (the same commit that added the Claude Agent package). The package started with the full node set for all Inference Providers pipeline tasks and the live Hub discovery mechanism. The only subsequent changes have been version bumps (e.g. `ca742050` rc.26, `f900e7a6` rc.25) and the broader provider registry work.

---

## Contributing

PRs are welcome at <https://github.com/nodetool-ai/nodetool>.

Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
