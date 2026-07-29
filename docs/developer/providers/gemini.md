---
layout: page
title: "Google Gemini: Add Models"
description: "How to add new Gemini text, Imagen image, and Veo video models to NodeTool's Gemini provider."
---

The Gemini provider supports six modalities: text/chat, image generation, video generation, TTS, ASR, and embeddings. Language models are auto-discovered from the API; every other modality uses a hand-maintained array in the provider file.

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
| Language model listing (dynamic) | `GeminiProvider.getAvailableLanguageModels()` |
| Image model listing (static) | `GeminiProvider.getAvailableImageModels()` |
| TTS model listing (static) | `GeminiProvider.getAvailableTTSModels()` |
| ASR model listing (static) | `GeminiProvider.getAvailableASRModels()` |
| Video model listing (static) | `GeminiProvider.getAvailableVideoModels()` |
| Embedding model listing (static) | `GeminiProvider.getAvailableEmbeddingModels()` |
| Token/chat cost | `@pydantic/genai-prices` catalog (automatic — no edit needed) |
| Non-token cost tiers | `packages/runtime/src/providers/cost-calculator.ts` — `PRICING_TIERS` / `MODEL_TO_TIER` |
| Provider registration | `packages/runtime/src/providers/index.ts` line 211 |

---

## How Gemini models are defined

### Language models — dynamic

`getAvailableLanguageModels()` calls `GET https://generativelanguage.googleapis.com/v1beta/models?key=<GEMINI_API_KEY>`, filters entries whose `supportedGenerationMethods` includes `"generateContent"`, and maps each to `{ id, name, provider: "gemini" }`. A new text/chat model becomes available when Google adds it to that endpoint.

### Image models — static array

`getAvailableImageModels()` returns a hardcoded array. Two dispatch paths exist inside `textToImage()`:

- IDs starting with `"gemini-"` — call `POST /models/<id>:generateContent` with `responseModalities: ["IMAGE", "TEXT"]`.
- All other IDs (Imagen: `"imagen-*"`) call `POST /models/<id>:predict`.

### Video models — static array

`getAvailableVideoModels()` returns a hardcoded array. Both `textToVideo()` and `imageToVideo()` require a `veo-*` model ID. Veo calls use the async `predictLongRunning` endpoint with polling.

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

Token/chat cost is priced through `@pydantic/genai-prices`. NodeTool maps the `"gemini"` provider to `"google"` in `GENAI_PROVIDER_MAP`.

### 2. Image model

Open `packages/runtime/src/providers/gemini-provider.ts` and add an entry to `getAvailableImageModels()`:

```typescript
async getAvailableImageModels(): Promise<ImageModel[]> {
  return [
    {
      id: "gemini-3.1-flash-image",
      name: "Gemini 3.1 Flash Image",
      provider: "gemini"
    },
    { id: "gemini-3-pro-image", name: "Gemini 3 Pro Image", provider: "gemini" }
  ];
}
```

The `"gemini-"` prefix uses the native `generateContent` endpoint. Legacy Imagen IDs use `predict`. Check Google's deprecation table before adding an Imagen model.

### 3. Gemini native image model (`gemini-*`)

Same as above, but use a `"gemini-"` prefixed ID. The `textToImage()` dispatcher routes it to `generateContent` with `responseModalities: ["IMAGE", "TEXT"]` automatically.

Use the exact ID returned by Google. Do not add guessed future IDs.

### 4. Veo video model

Open `getAvailableVideoModels()` and add an entry:

```typescript
override async getAvailableVideoModels(): Promise<VideoModel[]> {
  return [
    { id: "veo-3.1-generate-preview", name: "Veo 3.1 Preview", provider: "gemini" },
    { id: "veo-3.1-fast-generate-preview", name: "Veo 3.1 Fast Preview", provider: "gemini" },
    { id: "veo-3.1-lite-generate-preview", name: "Veo 3.1 Lite Preview", provider: "gemini" }
  ];
}
```

Veo model IDs must start with `"veo-"`. Check supported durations and resolutions for each variant before adding it.

### 5. ASR model

```typescript
async getAvailableASRModels(): Promise<ASRModel[]> {
  return [
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", provider: "gemini" },
    { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", provider: "gemini" }
  ];
}
```

### 6. TTS model

Add the model and its supported voices:

```typescript
async getAvailableTTSModels(): Promise<TTSModel[]> {
  const voices = ["Zephyr", "Puck" /*, ... existing voices ... */];
  return [
    { id: "gemini-3.1-flash-tts-preview", name: "Gemini 3.1 Flash TTS Preview", provider: "gemini", voices }
  ];
}
```

### 7. Embedding model

```typescript
async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
  return [
    { id: "gemini-embedding-2", name: "Gemini Embedding 2", provider: "gemini", dimensions: 3072 }
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
  --props '{"prompt": "a red apple", "model": {"id": "gemini-3.1-flash-image", "provider": "gemini", "name": "Gemini 3.1 Flash Image"}}'

# 5. Smoke-test via chat agent (text model — auto-discovered, no list change needed)
npm run dev:chat -- --provider gemini --model gemini-3.5-flash

# Combined (typecheck + lint + test):
npm run check
```

---

## Contributing

Open a PR at <https://github.com/nodetool-ai/nodetool>. Run `npm run check` (typecheck + lint + test) before pushing. Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
