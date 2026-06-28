---
layout: page
title: "Google Gemini: Add Models"
description: "How to add new Gemini text, Imagen image, and Veo video models to NodeTool's Gemini provider."
---

The Gemini provider supports five modalities: text/chat (dynamic), image via Imagen or native Gemini generation (static list), video via Veo (static list), TTS, ASR, and embeddings. Language models are auto-discovered from the API; every other modality is a hand-maintained array in the provider file.

> **Audience:** coding agents and contributors who need to add a new Gemini, Imagen, or Veo model to NodeTool.

---

## TL;DR

- **Text/chat models**: nothing to do — they are fetched live from `GET /v1beta/models`.
- **Image models** (Imagen + `gemini-*` image generation): add one entry to `getAvailableImageModels()` in the provider.
- **Video models** (Veo): add one entry to `getAvailableVideoModels()`.
- **TTS / ASR / embedding models**: add one entry to the matching method.
- Run `npm run check` before committing.

---

## Where things live

| Concern | Path |
|---|---|
| Provider (all Gemini logic) | `packages/runtime/src/providers/gemini-provider.ts` |
| Language model listing (dynamic) | `GeminiProvider.getAvailableLanguageModels()` — line 184 |
| Image model listing (static) | `GeminiProvider.getAvailableImageModels()` — line 729 |
| TTS model listing (static) | `GeminiProvider.getAvailableTTSModels()` — line 740 |
| ASR model listing (static) | `GeminiProvider.getAvailableASRModels()` — line 783 |
| Video model listing (static) | `GeminiProvider.getAvailableVideoModels()` — line 790 |
| Embedding model listing (static) | `GeminiProvider.getAvailableEmbeddingModels()` — line 801 |
| Token/chat cost | `@pydantic/genai-prices` catalog (automatic — no edit needed) |
| Non-token cost tiers | `packages/runtime/src/providers/cost-calculator.ts` — `PRICING_TIERS` / `MODEL_TO_TIER` |
| Provider registration | `packages/runtime/src/providers/index.ts` line 211 |

---

## How Gemini models are defined

### Language models — dynamic

`getAvailableLanguageModels()` (line 184) calls `GET https://generativelanguage.googleapis.com/v1beta/models?key=<GEMINI_API_KEY>`, filters entries whose `supportedGenerationMethods` includes `"generateContent"`, and maps each to `{ id, name, provider: "gemini" }`. No static list exists. A new text/chat model becomes available as soon as Google adds it to that endpoint.

### Image models — static array

`getAvailableImageModels()` (line 729) returns a hardcoded array. Two dispatch paths exist inside `textToImage()` (line 874):

- IDs starting with `"gemini-"` — call `POST /models/<id>:generateContent` with `responseModalities: ["IMAGE", "TEXT"]`.
- All other IDs (Imagen: `"imagen-*"`) — call `POST /models/<id>:generateImages` (Vertex-style endpoint).

### Video models — static array

`getAvailableVideoModels()` (line 790) returns a hardcoded array. Both `textToVideo()` (line 1242) and `imageToVideo()` (line 1296) guard on `modelId.startsWith("veo-")` and throw if the model ID does not match. All Veo calls use the async `predictLongRunning` endpoint with polling (`waitForVideoOperation`).

### TTS / ASR / Embedding — static arrays

Each is a simple array returned from the matching `getAvailable*` method. TTS models carry a `voices` field. Embedding models carry a `dimensions` field.

---

## Add a new model

### 1. Text/chat model

Nothing to do. The model appears automatically once Google adds it to the list API. Verify it shows up:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" \
  | jq '[.models[] | select(.supportedGenerationMethods[] | contains("generateContent")) | .name]'
```

Token/chat cost is priced automatically via `@pydantic/genai-prices` — NodeTool maps the `"gemini"` provider to `"google"` in `GENAI_PROVIDER_MAP` (cost-calculator.ts line 154).

### 2. Imagen image model

Open `packages/runtime/src/providers/gemini-provider.ts` and add an entry to `getAvailableImageModels()`:

```typescript
async getAvailableImageModels(): Promise<ImageModel[]> {
  return [
    {
      id: "gemini-3.1-flash-image-preview",
      name: "Gemini 3.1 Flash Image Preview",
      provider: "gemini"
    },
    { id: "imagen-4.0-generate-001", name: "Imagen 4.0", provider: "gemini" },
    // Add new Imagen entry here:
    { id: "imagen-4.1-generate-001", name: "Imagen 4.1", provider: "gemini" }
  ];
}
```

The model ID determines which dispatch path `textToImage()` uses — `"gemini-"` prefix uses the native `generateContent` endpoint; everything else uses `generateImages`. Imagen IDs start with `"imagen-"` so they route to `generateImages` automatically.

If Imagen 4.1 has a list price per generated image, add a tier to `cost-calculator.ts`:

```typescript
// PRICING_TIERS (line 56)
imagen41Standard: { costType: CostType.IMAGE_BASED, perImage: 0.04 },

// MODEL_TO_TIER (line 94)
"gemini:imagen-4.1-generate-001": "imagen41Standard",
```

If pricing is token-based (billed per token like chat models), skip the `PRICING_TIERS` entry — `@pydantic/genai-prices` handles it.

### 3. Gemini native image model (`gemini-*`)

Same as above, but use a `"gemini-"` prefixed ID. The `textToImage()` dispatcher routes it to `generateContent` with `responseModalities: ["IMAGE", "TEXT"]` automatically.

```typescript
{ id: "gemini-4.0-flash-image-preview", name: "Gemini 4.0 Flash Image Preview", provider: "gemini" }
```

### 4. Veo video model

Open `getAvailableVideoModels()` and add an entry:

```typescript
override async getAvailableVideoModels(): Promise<VideoModel[]> {
  return [
    { id: "veo-3.1-generate-preview", name: "Veo 3.1 Preview", provider: "gemini" },
    { id: "veo-2.0-generate-001", name: "Veo 2.0", provider: "gemini" },
    // Add new Veo entry here:
    { id: "veo-4.0-generate-001", name: "Veo 4.0", provider: "gemini" }
  ];
}
```

Veo model IDs must start with `"veo-"`. Both `textToVideo()` (line 1248) and `imageToVideo()` (line 1306) throw if the ID does not match that prefix, so a non-Veo ID will break at runtime. If Veo 4.0 charges per second of video, add a tier:

```typescript
// PRICING_TIERS
veo40Standard: { costType: CostType.VIDEO_BASED, perSecondVideo: 0.05 },

// MODEL_TO_TIER
"gemini:veo-4.0-generate-001": "veo40Standard",
```

### 5. ASR model

```typescript
async getAvailableASRModels(): Promise<ASRModel[]> {
  return [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini" },
    // Add new ASR model here:
    { id: "gemini-3.0-flash", name: "Gemini 3.0 Flash", provider: "gemini" }
  ];
}
```

### 6. TTS model

Add the model and its supported voices:

```typescript
async getAvailableTTSModels(): Promise<TTSModel[]> {
  const voices = ["Zephyr", "Puck" /*, ... existing voices ... */];
  return [
    { id: "gemini-2.5-pro-preview-tts", name: "Gemini 2.5 Pro TTS", provider: "gemini", voices },
    // Add new TTS model here:
    { id: "gemini-3.0-flash-tts", name: "Gemini 3.0 Flash TTS", provider: "gemini", voices }
  ];
}
```

### 7. Embedding model

```typescript
async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
  return [
    { id: "text-embedding-004", name: "Text Embedding 004", provider: "gemini", dimensions: 768 },
    { id: "gemini-embedding-001", name: "Gemini Embedding 001", provider: "gemini", dimensions: 3072 },
    // Add new embedding model here:
    { id: "gemini-embedding-002", name: "Gemini Embedding 002", provider: "gemini", dimensions: 4096 }
  ];
}
```

---

## Verify

```bash
# 1. Type-check all packages
npm run typecheck

# 2. Lint
npm run lint

# 3. Run all tests
npm run test

# 4. Smoke-test a new image node (requires GEMINI_API_KEY in env or DB)
npm run dev:nodetool -- node run nodetool.image.GenerateImage \
  --props '{"prompt": "a red apple", "model": {"id": "imagen-4.1-generate-001", "provider": "gemini", "name": "Imagen 4.1"}}'

# 5. Smoke-test via chat agent (text model — auto-discovered, no list change needed)
npm run dev:chat -- --provider gemini --model gemini-2.5-flash

# Combined (typecheck + lint + test):
npm run check
```

---

## How past commits did it

The Gemini provider and its static image/video lists were present from the initial provider architecture. The most recent structural change is commit **`8871e185`** ("refactor(agents): drive agent tool loops via provider.generateLoop", PR #3948), which updated `gemini-provider.ts` to expose `generateLoop` so agent executors delegate their tool-calling loop to the provider rather than running their own. That commit is the best reference for how the provider's internal dispatch methods are structured — the model list arrays themselves were not touched, confirming that adding models requires only the `getAvailable*` array edits described above.

---

## Contributing

Open a PR at <https://github.com/nodetool-ai/nodetool>. Run `npm run check` (typecheck + lint + test) before pushing. Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
