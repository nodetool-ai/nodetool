---
layout: page
title: "Google Gemini: Add Models"
description: "How to add new Gemini text, image, Veo and Omni video, and Lyria music models to NodeTool's Gemini provider."
---

The Gemini provider supports seven modalities: text/chat, image generation, video generation, music generation, TTS, ASR, and embeddings. Language models are auto-discovered from the API; every other modality uses a hand-maintained array in the provider file.

> **Audience:** coding agents and contributors who need to add a new Gemini, Veo, or Lyria model to NodeTool.

---

## TL;DR

- **Text/chat models**: nothing to do — they are fetched live from `GET /v1beta/models`.
- **Image models** (`gemini-*` image generation): add one entry to `getAvailableImageModels()` in the provider.
- **Video models** (Veo, Gemini Omni): add one entry to `GEMINI_VIDEO_MODELS`.
- **Music models** (Lyria): add one entry to `getAvailableMusicModels()`.
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
| Video model listing (static) | `GEMINI_VIDEO_MODELS`, returned by `getAvailableVideoModels()` |
| Music model listing (static) | `GeminiProvider.getAvailableMusicModels()` |
| Embedding model listing (static) | `GeminiProvider.getAvailableEmbeddingModels()` |
| Token/chat cost | `@pydantic/genai-prices` catalog (automatic — no edit needed) |
| Non-token cost tiers | `packages/runtime/src/providers/cost-calculator.ts` — `PRICING_TIERS` / `MODEL_TO_TIER` |
| Provider registration | `packages/runtime/src/providers/index.ts` line 211 |

---

## How Gemini models are defined

### Language models — dynamic

`getAvailableLanguageModels()` calls `GET https://generativelanguage.googleapis.com/v1beta/models?key=<GEMINI_API_KEY>`, filters entries whose `supportedGenerationMethods` includes `"generateContent"`, and maps each to `{ id, name, provider: "gemini" }`. A new text/chat model becomes available when Google adds it to that endpoint.

### Image models — static array

`getAvailableImageModels()` returns a hardcoded array. `textToImage()` and `imageToImage()` accept only `"gemini-"` IDs, which call `POST /models/<id>:generateContent` with `responseModalities: ["IMAGE", "TEXT"]`. Google shut down Imagen in the Gemini API, so `imagen-*` IDs fail before any request.

### Video models — static array

`GEMINI_VIDEO_MODELS` lists each video model with its `supportedTasks`, resolutions, and aspect ratios. `referenceToVideo()`, `extendVideo()`, and `videoToVideo()` refuse a model whose entry lacks the task.

- `veo-*` IDs use the async `predictLongRunning` endpoint with polling. Veo 3.1 and Veo 3.1 Fast also take up to three reference images, a last frame (`endImage`), and extension. Reference images and a last frame force an 8-second clip. Extension appends exactly 7 seconds to the end of a 720p input. Veo 3.1 Lite takes none of these.
- `gemini-omni-*` IDs call `POST /v1beta/interactions` with `response_format: { type: "video" }`. Omni covers text-to-video, image-to-video, reference-to-video, and video editing (`videoToVideo`). Input videos above the inline limit go through the Files API.

### Music models — static array

`getAvailableMusicModels()` lists the Lyria models. `textToMusic()` calls `POST /v1beta/interactions`. Lyria has no duration or lyrics field, so the provider appends both to the prompt. Output is MP3 unless the caller asks Lyria 3.5 for WAV.

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

Open `packages/runtime/src/providers/gemini-provider.ts` and add an entry to `getAvailableImageModels()`. The ID must start with `"gemini-"`:

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

Use the exact ID returned by Google. Do not add guessed future IDs.

### 3. Video model

Add an entry to `GEMINI_VIDEO_MODELS` and list only the tasks Google documents for that variant:

```typescript
{
  id: "veo-3.1-generate-preview",
  name: "Veo 3.1 Preview",
  provider: "gemini",
  supportedTasks: ["text_to_video", "image_to_video", "reference_to_video", "extend_video", "extend_video_end"],
  resolutions: ["720p", "1080p", "4k"],
  aspectRatios: ["16:9", "9:16"]
}
```

Veo IDs must start with `"veo-"` and Omni IDs with `"gemini-omni-"`. The prefix selects the endpoint. Leave `durations` off a model that supports `extend_video` unless its extension lengths match its generation lengths: the timeline checks the extension length against that list.

### 4. Music model

```typescript
override async getAvailableMusicModels(): Promise<MusicModel[]> {
  return [
    { id: "lyria-3.5", name: "Lyria 3.5", provider: "gemini", supportedTasks: ["text_to_music"] }
  ];
}
```

Lyria IDs must start with `"lyria-"`.

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
    { id: "gemini-3.8-flash-tts", name: "Gemini 3.8 Flash TTS", provider: "gemini", voices },
    { id: "gemini-3.8-flash-lite-tts", name: "Gemini 3.8 Flash-Lite TTS", provider: "gemini", voices }
  ];
}
```

### 7. Embedding model

```typescript
async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
  return [
    { id: "gemini-embedding-2", name: "Gemini Embedding 2", provider: "gemini", dimensions: 3072 },
    { id: "gemini-embedding-001", name: "Gemini Embedding 001", provider: "gemini", dimensions: 3072 }
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
npm run dev:nodetool -- node run nodetool.image.TextToImage \
  --props '{"prompt": "a red apple", "model": {"type": "image_model", "id": "gemini-3.1-flash-image", "provider": "gemini", "name": "Gemini 3.1 Flash Image"}}'

# 5. Smoke-test via chat agent (text model — auto-discovered, no list change needed)
npm run dev:chat -- --provider gemini --model gemini-3.5-flash

# Combined (typecheck + lint + test):
npm run check
```

---

## Contributing

Open a PR at <https://github.com/nodetool-ai/nodetool>. Run `npm run check` (typecheck + lint + test) before pushing. Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
