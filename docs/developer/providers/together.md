---
layout: page
title: "Together AI: Add Models & Nodes"
description: "How to add new Together AI models and workflow nodes to NodeTool — manifest entries, provider lists, codegen, and verification."
---

> **Audience:** Contributors and coding agents adding Together AI models or nodes to this repo.

## TL;DR

1. Edit `IMAGE_MODELS`, `VIDEO_MODELS`, `TTS_MODELS`, or `ASR_MODELS` in `scripts/generate-manifest.mjs`.
2. Run `npm run gen:manifest` — rewrites `src/together-manifest.json`.
3. Run `npm run build` in the package, then `npm run typecheck && npm run test`.
4. For TTS / ASR / embedding **provider-side** models only: also update the static arrays in `packages/runtime/src/providers/together-provider.ts`.
5. Verify with `nodetool node run together.<module>.<ClassName>`.

---

## Where things live

| What | Path |
|------|------|
| Manifest generator (source of truth) | `packages/together-nodes/scripts/generate-manifest.mjs` |
| Generated manifest (do not hand-edit) | `packages/together-nodes/src/together-manifest.json` |
| Node factory (manifest → `BaseNode` subclasses) | `packages/together-nodes/src/together-factory.ts` |
| HTTP helpers / API executors | `packages/together-nodes/src/together-base.ts` |
| Node registration entry point | `packages/together-nodes/src/index.ts` |
| Provider class (chat, image, video, TTS, ASR, embeddings) | `packages/runtime/src/providers/together-provider.ts` |
| Manifest→model-list bridge | `packages/runtime/src/providers/manifest-models.ts` |
| Provider registration | `packages/runtime/src/providers/index.ts` line 227 |
| Pack registration (websocket server) | `packages/websocket/src/node-registry-setup.ts` line 104 |
| Pack catalog entry | `packages/protocol/src/builtin-packs.ts` |
| `PROVIDER_IDS.TOGETHER` constant | `packages/protocol/src/api-types.ts` line 877 |

---

## How Together models and nodes are defined

### Image and video nodes — generated from the manifest

`src/together-manifest.json` is **generated code**. The source of truth is `scripts/generate-manifest.mjs`, which defines four model catalogs (`IMAGE_MODELS`, `VIDEO_MODELS`, `TTS_MODELS`, `ASR_MODELS`) and expands each `(model × task)` pair into a manifest entry.

Each entry looks like this:

```json
{
  "className": "FLUX1SchnellTextToImage",
  "moduleName": "image",
  "modality": "text_to_image",
  "modelId": "black-forest-labs/FLUX.1-schnell",
  "outputType": "image",
  "title": "FLUX.1 Schnell — Text to Image",
  "description": "FLUX.1 Schnell — text to image via Together AI serverless.",
  "fields": [ ... ],
  "supportedTasks": ["text_to_image"]
}
```

The factory (`together-factory.ts`) turns every entry into a `BaseNode` subclass at runtime. The node type is `together.<moduleName>.<className>`. Fields declared in `"fields"` become node properties; the `"modality"` value routes execution to the matching HTTP executor in `together-base.ts`.

The same manifest is read by `manifest-models.ts` (via `loadImageModels` / `loadVideoModels`) to populate `TogetherProvider.getAvailableImageModels()` and `getAvailableVideoModels()`. This means the node catalog and the provider's model catalog stay in sync automatically — there is no second list to update for image and video models.

### Chat / language models — fetched dynamically

`TogetherProvider.getAvailableLanguageModels()` calls `https://api.together.xyz/v1/models` at runtime and filters entries where `type === "chat" || type === "language" || type === ""`. No static list exists for chat models; Together's live catalog drives what appears in the model picker. No code change is required when Together adds a new chat model.

### TTS, ASR, and embedding models — static arrays in the provider

These are hardcoded in `packages/runtime/src/providers/together-provider.ts`:

- `TOGETHER_TTS_MODELS` — 3 entries (Orpheus 3B, Kokoro 82M, Cartesia Sonic), each with a `voices` list.
- `TOGETHER_ASR_MODELS` — 3 entries (Whisper Large v3, Voxtral Mini 3B, Parakeet TDT 0.6B v3).
- `TOGETHER_EMBEDDING_MODELS` — 1 entry (Multilingual E5 Large, 1024 dims).

TTS models are **also** in the manifest (so they get workflow nodes). ASR and embedding models currently appear only in the provider arrays (no dedicated workflow nodes yet).

---

## Add a new model or node

The steps differ slightly by modality.

### Image or video model

**1. Open the generator and add an entry to the right catalog.**

```js
// packages/together-nodes/scripts/generate-manifest.mjs

const IMAGE_MODELS = [
  // existing entries ...
  {
    id: "black-forest-labs/FLUX.3-ultra",     // Together API model id
    name: "FLUX.3 Ultra",                     // display name → drives className
    tasks: ["text_to_image", "image_to_image"] // which node(s) to generate
  }
];
```

For video, append to `VIDEO_MODELS` with `tasks: ["text_to_video", "image_to_video"]` (or just one if the model is task-specific).

**2. Regenerate and build.**

```bash
cd packages/together-nodes
npm run gen:manifest        # rewrites src/together-manifest.json
npm run build               # tsc + copies manifest into dist/
npm test
```

That's all. The factory auto-generates the node class, and `manifest-models.ts` picks up the new model for the provider's model lists.

### TTS model

TTS models need entries in both the manifest generator **and** the provider array.

**1. Add to the generator's `TTS_MODELS`.**

```js
// packages/together-nodes/scripts/generate-manifest.mjs

const TTS_MODELS = [
  // existing entries ...
  {
    id: "vendor/new-tts-model",
    name: "New TTS Model",
    voices: ["voice_a", "voice_b"]
  }
];
```

**2. Regenerate and build** (same as above).

**3. Add the provider-side entry.**

```ts
// packages/runtime/src/providers/together-provider.ts

const TOGETHER_TTS_MODELS: TTSModel[] = [
  // existing entries ...
  {
    id: "vendor/new-tts-model",
    name: "New TTS Model",
    provider: "together",
    voices: ["voice_a", "voice_b"]
  }
];
```

### ASR model

ASR nodes are not yet generated from the manifest, so update only the provider array:

```ts
// packages/runtime/src/providers/together-provider.ts

const TOGETHER_ASR_MODELS: ASRModel[] = [
  // existing entries ...
  { id: "vendor/new-asr-model", name: "New ASR Model", provider: "together" }
];
```

### Embedding model

Same pattern as ASR:

```ts
// packages/runtime/src/providers/together-provider.ts

const TOGETHER_EMBEDDING_MODELS: EmbeddingModel[] = [
  // existing entries ...
  {
    id: "vendor/new-embedding-model",
    name: "New Embedding Model",
    provider: "together",
    dimensions: 1024
  }
];
```

---

## Verify

**1. Build and type-check.**

```bash
npm run build --workspace=packages/together-nodes
npm run typecheck
```

**2. Run package tests.**

```bash
npm run test --workspace=packages/together-nodes
```

**3. Exercise the node in isolation** (requires `TOGETHER_API_KEY` in secrets or env).

For a text-to-image node the type is `together.image.<ClassName>`:

```bash
npm run dev:nodetool -- node run together.image.FLUX1SchnellTextToImage \
  --props '{"prompt":"a red panda on a skateboard","width":512,"height":512}'
```

For a video node:

```bash
npm run dev:nodetool -- node run together.video.Veo30TextToVideo \
  --props '{"prompt":"timelapse of clouds","aspect_ratio":"16:9","resolution":"720p","duration":6}'
```

For a TTS node:

```bash
npm run dev:nodetool -- node run together.audio.Orpheus3BTextToSpeech \
  --props '{"text":"Hello from Together AI","voice":"tara","format":"mp3"}'
```

**4. Static workflow check** (no API call).

```bash
npm run dev:nodetool -- validate workflow.json
```

**5. Combined lint + typecheck + test.**

```bash
npm run check
```

---

## How past PRs did it

The entire `packages/together-nodes` package — generator script, manifest (56 entries), factory, base helpers, provider arrays, and tests — was introduced in commit **`d1491abf`** ("add claude agent package"). That single commit is the reference for how the package was structured from the start. It adds:

- `packages/together-nodes/scripts/generate-manifest.mjs` (214 lines, the generator)
- `packages/together-nodes/src/together-manifest.json` (4274 lines, 56 entries)
- `packages/together-nodes/src/together-factory.ts` (405 lines)
- `packages/together-nodes/src/together-base.ts` (553 lines)
- `packages/runtime/src/providers/together-provider.ts` (780 lines)
- Full test coverage: `tests/together-base.test.ts` and `tests/providers/together-provider.test.ts`

To see the full diff: `git show d1491abf`.

---

## Contributing

- Repository: <https://github.com/nodetool-ai/nodetool>
- Discord: <https://discord.gg/WmQTWZRcYE>
- Before opening a PR, run `npm run check` (typecheck + lint + tests). PRs that break any of the three will not merge.
- Follow the writing style in [docs/WRITING_STYLE.md](../../WRITING_STYLE.md) for any Markdown you touch.
