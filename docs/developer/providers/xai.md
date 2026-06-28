---
layout: page
title: "xAI (Grok): Add Models"
description: "How to add new Grok chat, image, and video models to NodeTool's xAI provider."
---

`XAIProvider` sits at `packages/runtime/src/providers/xai-provider.ts`. It extends `OpenAIProvider` but overrides every model-discovery method and every generation method to call xAI's REST API directly. Chat models are discovered at runtime by fetching `/v1/models`; image and video models come from the same listing, filtered by `output_modalities`.

> **Audience:** coding agents and contributors adding new xAI Grok models (chat, image generation, video generation).

---

## TL;DR

Chat and image/video models are all discovered dynamically from xAI's `/v1/models` endpoint. To support a new model:

1. Store `XAI_API_KEY` via `npm run dev:nodetool -- secrets store XAI_API_KEY`.
2. Verify the model appears in the `/v1/models` listing and that `classifyModel()` assigns it the right modality.
3. If `classifyModel()` misclassifies the model (no `output_modalities` field and an ambiguous id), add an `id.includes()` branch in `classifyModel()`.
4. Run `npm run check`.

No static lists to edit. No registry changes. No rebuilds needed for the provider itself.

---

## Where things live

| Concern | Path |
|---|---|
| Provider class | `packages/runtime/src/providers/xai-provider.ts` |
| Provider registration | `packages/runtime/src/providers/index.ts` line 235 |
| Provider ID constant | `packages/protocol/src/api-types.ts` (`PROVIDER_IDS.XAI = "xai"`) |
| Cloud profile allowlist | `packages/protocol/src/cloud-profile.ts` (`CLOUD_PROVIDER_IDS`, `CLOUD_NODE_NAMESPACES`) |
| Provider tests | `packages/runtime/tests/providers/xai-provider.test.ts` |
| Type definitions | `packages/runtime/src/providers/types.ts` |

---

## How xAI models are defined

All three modalities — chat, image, video — are discovered at runtime from a single call to xAI's `/v1/models` endpoint (`fetchModelRows()`). The private `classifyModel()` function sorts models into `"language" | "image" | "video"` by inspecting `output_modalities` first, then falling back to the model's `id` string:

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

`getAvailableLanguageModels()`, `getAvailableImageModels()`, and `getAvailableVideoModels()` each call `fetchModelRows()` and filter the result through `classifyModel()`. There are **no static model lists** in this provider.

Image models are tagged `supportedTasks: ["text_to_image", "image_to_image"]`. Video models are tagged `supportedTasks: ["text_to_video", "image_to_video"]`. Both sets are returned with `provider: "xai"`.

Generation calls go directly to xAI's REST API:

| Task | Endpoint |
|---|---|
| `textToImage` | `POST /v1/images/generations` |
| `imageToImage` | `POST /v1/images/edits` |
| `textToVideo` / `imageToVideo` | `POST /v1/videos/generations` (async, polls `/v1/videos/{request_id}`) |

Image inputs are converted to base64 data URIs before sending — xAI's JSON API rejects multipart uploads.

---

## Add a new model

### Chat (language) model

No code change required. If xAI adds a new chat model and exposes it via `/v1/models` with `output_modalities: ["text"]`, NodeTool picks it up automatically on the next `getAvailableLanguageModels()` call.

To verify the model appears:

```bash
curl -s https://api.x.ai/v1/models \
  -H "Authorization: Bearer $XAI_API_KEY" | jq '.data[] | {id, output_modalities}'
```

If the response includes the new model with `output_modalities` containing `"text"`, you are done. Run `npm run check` and open a PR only if you needed to change `classifyModel()`.

### Image model

Same as chat: no static list to edit. xAI must return `output_modalities: ["image"]` for the model. If it does not (the field is missing and the model id does not contain `"image"`), add a guard in `classifyModel()`:

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

Same discovery path via `classifyModel()`. If the id contains `"video"` or `output_modalities` contains `"video"`, it surfaces in `getAvailableVideoModels()` tagged `supportedTasks: ["text_to_video", "image_to_video"]`.

The async polling loop in `generateVideo()` handles all video models uniformly. xAI video parameters:

- `duration`: 1–15 seconds (mapped from `params.durationSeconds` or derived from `numFrames`)
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
npm run dev:nodetool -- info --json | jq '.providers[] | select(.id=="xai")'

# 5. Full check
npm run check
```

If you changed `classifyModel()` or any generation method, also run the provider unit tests directly:

```bash
npm run test --workspace=packages/runtime -- --reporter=verbose xai-provider
```

---

## How PR #3951 did it

Commit `69dd6f88` ("Add image and video generation support to XAI provider", [PR #3951](https://github.com/nodetool-ai/nodetool/pull/3951)) is the canonical reference for this provider.

**Before the PR**, `XAIProvider` had no `classifyModel()` logic. It called `super.getAvailableLanguageModels()`, which returned every model from `/v1/models` — including Grok Imagine image and video models — as language models. `getAvailableImageModels()` and `getAvailableVideoModels()` were not overridden, so they returned the parent `OpenAIProvider`'s lists (OpenAI models, not xAI ones).

**What the PR changed** (two commits):

1. **Commit 1** — added `classifyModel()`, `fetchModelRows()`, and three overriding `getAvailable*()` methods. Chat models now come from rows whose `output_modalities` contains `"text"`. Image and video models come from the same listing, classified and returned with `provider: "xai"` and the correct `supportedTasks`.

2. **Commit 2** — overrode all four generation methods (`textToImage`, `imageToImage`, `textToVideo`, `imageToVideo`) to call xAI's REST API directly instead of using the OpenAI SDK's multipart upload path (which xAI rejects). Added `detectImageMime()` and `bytesToDataUri()` to inline image bytes as base64 data URIs. Added the `generateVideo()` async polling loop for the `/v1/videos/generations` → `/v1/videos/{id}` flow.

The PR also added 276 lines of unit tests in `packages/runtime/tests/providers/xai-provider.test.ts`, covering all four generation methods and the model classification logic with mocked fetch responses.

**The pattern to mirror**: if xAI adds a new endpoint category (e.g., audio generation), follow the same two-step shape — first add classification + discovery in the appropriate `getAvailable*()` override, then add the generation method calling xAI's REST API directly with `this._xaiFetch`.

---

## Contributing

Open PRs at <https://github.com/nodetool-ai/nodetool>. Before pushing:

```bash
npm run check   # typecheck + lint + test across all workspaces
```

Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
