---
layout: page
title: "xAI (Grok): Add Models"
description: "How to add new Grok chat, image, and video models to NodeTool's xAI provider."
---

`XAIProvider` sits at `packages/runtime/src/providers/xai-provider.ts`. It extends `OpenAICompatProvider`, so chat uses xAI's OpenAI-compatible Chat Completions endpoint. It overrides model discovery and the four image and video generation methods to call xAI's REST API directly. Each modality lists the static `XAI_KNOWN_MODELS` catalog first, then any further models from xAI's `/v1/models` listing.

> **Audience:** coding agents and contributors adding new xAI Grok models (chat, image generation, video generation).

---

## TL;DR

To support a new model:

1. Add it to the matching modality in `XAI_KNOWN_MODELS` with a display name. The catalog keeps the model listed when `/v1/models` omits it or cannot be reached.
2. Update the `KNOWN_*_IDS` constants in `packages/runtime/tests/providers/xai-provider.test.ts`.
3. If the id is ambiguous, check that `classifyModel()` assigns the live row the same modality. Otherwise the model appears twice, once under each modality.
4. Run `npm run test:affected`, `npm run typecheck`, and `npm run lint`.

xAI's `/v1/models` rows carry no modality fields, so `classifyModel()` usually falls back to the model id. Models the listing returns that the catalog lacks are still offered, after the catalog entries.

---

## Where things live

| Concern | Path |
|---|---|
| Provider class | `packages/runtime/src/providers/xai-provider.ts` |
| Provider registration | `packages/runtime/src/providers/index.ts` (`registerBuiltinProvider(PROVIDER_IDS.XAI, XAIProvider, …)`) |
| Provider ID constant | `packages/protocol/src/api-types.ts` (`PROVIDER_IDS.XAI = "xai"`) |
| Cloud profile node namespaces | `packages/protocol/src/cloud-profile.ts` (`CLOUD_NODE_NAMESPACES` lists `xai`. `NON_CLOUD_PROVIDER_IDS` does not) |
| Provider tests | `packages/runtime/tests/providers/xai-provider.test.ts` |
| Type definitions | `packages/runtime/src/providers/types.ts` |

---

## How xAI models are defined

Each modality starts from its `XAI_KNOWN_MODELS` entries. The provider then adds rows from a single call to xAI's `/v1/models` endpoint (`fetchModelRows()`) whose ids the catalog does not already contain. A failed listing yields the catalog alone. The private `classifyModel()` function sorts models into `"language" | "image" | "video"` by inspecting `output_modalities` first, then falling back to the model's `id` string:

```typescript
// packages/runtime/src/providers/xai-provider.ts

function classifyModel(row: XAIModelRow): ModelModality {
  const out = (row.output_modalities ?? []).map((m) => m.toLowerCase());
  if (out.includes("video"))  return "video";
  if (out.includes("image"))  return "image";
  if (out.includes("text"))   return "language";

  const id = row.id.toLowerCase();
  if (id.includes("video")) return "video";
  if (id.includes("image")) return "image";
  return "language";   // fallback
}
```

`getAvailableLanguageModels()`, `getAvailableImageModels()`, and `getAvailableVideoModels()` each call `listModels()`, which merges the catalog with the classified live rows.

Image models are tagged `supportedTasks: ["text_to_image", "image_to_image"]`. Video models are tagged `supportedTasks: ["text_to_video", "image_to_video"]`. Both sets are returned with `provider: "xai"`.

Generation calls go directly to xAI's REST API:

| Task | Endpoint |
|---|---|
| `textToImage` | `POST /v1/images/generations` |
| `imageToImage` | `POST /v1/images/edits` |
| `textToVideo` / `imageToVideo` | `POST /v1/videos/generations` (async, polls `/v1/videos/{request_id}` until `done`, `failed`, or `expired`, with a 600 second default timeout) |

Image inputs are converted to base64 data URIs before sending — xAI's JSON API rejects multipart uploads.

---

## Add a new model

### Chat (language) model

Add the model to `XAI_KNOWN_MODELS.language`. A chat model that `/v1/models` returns is also picked up without a code change, after the catalog entries and under its raw id.

To check what the live listing returns:

```bash
curl -s https://api.x.ai/v1/models \
  -H "Authorization: Bearer $XAI_API_KEY" | jq '.data[].id'
```

### Image model

Add the model to `XAI_KNOWN_MODELS.image`. A live row reaches the image list only when `output_modalities` contains `"image"` or the id contains `"image"`. For any other id, add a guard in `classifyModel()`:

```typescript
// packages/runtime/src/providers/xai-provider.ts — inside classifyModel()
const id = row.id.toLowerCase();
if (id.includes("video"))          return "video";
if (id.includes("image"))          return "image";
if (id.includes("grok-imagine"))   return "image";  // ← add this if needed
return "language";
```

`getAvailableImageModels()` will then include the model with `supportedTasks: ["text_to_image", "image_to_image"]` and route calls through `textToImage` / `imageToImage` already in the provider.

No `supportedTasks` override is needed unless xAI adds a task the model does not support (e.g., image editing); in that case narrow the array:

```typescript
// hypothetical future: image-only model (no editing)
supportedTasks: ["text_to_image"]
```

That change goes in `getAvailableImageModels()` after the `classifyModel()` filter, keyed on `row.id`.

### Video model

Add the model to `XAI_KNOWN_MODELS.video`. A live row reaches the video list when its id contains `"video"` or `output_modalities` contains `"video"`, it surfaces in `getAvailableVideoModels()` tagged `supportedTasks: ["text_to_video", "image_to_video"]`.

The async polling loop in `generateVideo()` handles all video models uniformly. xAI video parameters:

- `duration`: 1–15 whole seconds (from `params.durationSeconds`, or `numFrames` at an assumed 24 fps, rounded and clamped)
- `aspect_ratio`: passed through if set
- `resolution`: passed through if set

No new code is needed unless the model requires a parameter xAI did not previously support. Add it in `textToVideo` or `imageToVideo`:

```typescript
// packages/runtime/src/providers/xai-provider.ts

override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
  const request: Record<string, unknown> = {
    model: params.model.id,
    prompt: params.prompt
  };
  const duration = XAIProvider.resolveVideoDuration(params);
  if (duration !== undefined) request.duration = duration;
  if (params.aspectRatio)  request.aspect_ratio = params.aspectRatio;
  if (params.resolution)   request.resolution   = params.resolution;
  // Add new xAI-specific param here, e.g.:
  // if (params.style) request.style = params.style;
  return this.generateVideo(request, params.timeoutSeconds);
}
```

---

## Verify

```bash
# 1. Confirm the model appears in the live listing
curl -s https://api.x.ai/v1/models \
  -H "Authorization: Bearer $XAI_API_KEY" | jq '.data[].id'

# 2. Type check and lint
npm run typecheck
npm run lint

# 3. Run the xAI provider tests
npm run test --workspace=packages/runtime

# 4. Smoke-test: list available models via the CLI (requires XAI_API_KEY set)
npm run dev:nodetool -- models by-provider xai --kind video

# 5. Affected tests and the harness gate
npm run test:affected
npm run dev:nodetool -- harness gate --base origin/main
```

If you changed `classifyModel()` or any generation method, also run the provider unit tests directly:

```bash
npm run test --workspace=packages/runtime -- --reporter=verbose xai-provider
```

---

## Contributing

Open PRs at <https://github.com/nodetool-ai/nodetool>. Before pushing:

```bash
npm run test:affected
npm run typecheck
npm run lint
```

Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
