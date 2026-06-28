---
layout: page
title: "OpenAI: Add Models"
description: "How to add new OpenAI models to NodeTool — chat models appear automatically; image models require a one-line code edit."
---

NodeTool's OpenAI integration lives in one file:
`packages/runtime/src/providers/openai-provider.ts` (1399 lines).
The provider is registered under `PROVIDER_IDS.OPENAI = "openai"` in
`packages/protocol/src/api-types.ts` (line 860).

> **Audience:** coding agents and contributors adding new OpenAI models.

---

## TL;DR

| Model type | What to do |
|---|---|
| Chat / LLM (e.g. `gpt-5`, `o3`) | Nothing — the list is fetched live from `https://api.openai.com/v1/models` |
| Image (e.g. `gpt-image-3`) | Add one entry to `getAvailableImageModels()` (~line 249) and one pricing entry if quality-based |
| Video (e.g. `sora-3`) | Add one entry to `getAvailableVideoModels()` (~line 232) |
| TTS / ASR / Embedding | Add one entry to the matching static getter |

---

## Where things live

| Concern | Path | Notes |
|---|---|---|
| Provider class | `packages/runtime/src/providers/openai-provider.ts` | All model lists and API calls |
| Provider ID constant | `packages/protocol/src/api-types.ts` line 860 | `PROVIDER_IDS.OPENAI = "openai"` |
| Provider registration | `packages/runtime/src/providers/index.ts` | Imports and re-exports `OpenAIProvider` |
| Non-token pricing tiers | `packages/runtime/src/providers/cost-calculator.ts` lines 56–87 | `PRICING_TIERS` object |
| Per-model tier mapping | `packages/runtime/src/providers/cost-calculator.ts` lines 94–113 | `MODEL_TO_TIER` object |
| Quality-based image cost | `packages/runtime/src/providers/cost-calculator.ts` lines 368–392 | `calculateImageCost()` |

---

## How OpenAI models are defined

### Chat / LLM models — dynamic

`getAvailableLanguageModels()` (line 178) makes a live `GET` request to
`https://api.openai.com/v1/models` using the stored API key, then maps every
returned `id` to a `LanguageModel` object:

```typescript
// openai-provider.ts lines 178–203
async getAvailableLanguageModels(): Promise<LanguageModel[]> {
  const response = await this._fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${this.apiKey}` }
  });
  if (!response.ok) return [];
  const payload = await response.json() as { data?: Array<{ id?: string }> };
  return (payload.data ?? [])
    .filter((row): row is { id: string } => typeof row.id === "string")
    .map((row) => ({ id: row.id, name: row.id, provider: "openai" }));
}
```

A new chat model released by OpenAI appears in NodeTool automatically the next
time the model list is refreshed — no code change needed.

**Tool support** is controlled by `hasToolSupport()` (line 174):

```typescript
async hasToolSupport(model: string): Promise<boolean> {
  return !(model.startsWith("o1") || model.startsWith("o3"));
}
```

If a new model needs to opt out of tool use, add its prefix here.

### Image, video, TTS, ASR, and embedding models — static

These model types are returned from hardcoded lists inside the provider because
OpenAI's `/v1/models` endpoint does not distinguish modalities. Each getter
returns an array of typed objects.

`getAvailableImageModels()` (line 249) currently lists four models:
`gpt-image-2`, `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini`.

`getAvailableVideoModels()` (line 232) lists `sora-2` and `sora-2-pro`.

`getAvailableTTSModels()` (line 205), `getAvailableASRModels()` (line 222),
and `getAvailableEmbeddingModels()` (line 278) follow the same pattern.

---

## Add a new image model

### 1. Add the entry to `getAvailableImageModels()`

Open `packages/runtime/src/providers/openai-provider.ts` and add to the array
returned at line 249. Match the shape of existing entries exactly:

```typescript
// packages/runtime/src/providers/openai-provider.ts  ~line 249
async getAvailableImageModels(): Promise<ImageModel[]> {
  return [
    {
      id: "gpt-image-3",           // OpenAI API model ID
      name: "GPT Image 3",         // display name shown in the UI
      provider: "openai",
      supportedTasks: ["text_to_image", "image_to_image"]
    },
    // ... existing entries ...
  ];
}
```

`supportedTasks` must be a subset of `["text_to_image", "image_to_image", "inpainting"]` —
use whichever the model actually supports.

### 2. Add pricing if quality-based

`calculateImageCost()` in `cost-calculator.ts` (line 376) special-cases any
model whose ID contains `"gpt-image"` (excluding `gpt-image-1.5`) and routes it
through quality tiers defined in `PRICING_TIERS` (lines 57–60):

```typescript
// cost-calculator.ts lines 57–60
imageGptLow:    { costType: CostType.IMAGE_BASED, perImage: 0.011 },
imageGptMedium: { costType: CostType.IMAGE_BASED, perImage: 0.042 },
imageGptHigh:   { costType: CostType.IMAGE_BASED, perImage: 0.167 },
```

If `gpt-image-3` uses the same three-tier structure at different prices, add
new tiers and extend the `qualityMap` inside `calculateImageCost()` (line 377):

```typescript
// cost-calculator.ts  PRICING_TIERS — add new tiers
imageGpt3Low:    { costType: CostType.IMAGE_BASED, perImage: 0.015 },
imageGpt3Medium: { costType: CostType.IMAGE_BASED, perImage: 0.060 },
imageGpt3High:   { costType: CostType.IMAGE_BASED, perImage: 0.200 },
```

Then guard the existing `qualityMap` lookup to branch on model ID:

```typescript
// cost-calculator.ts  calculateImageCost()
if (modelId.toLowerCase().includes("gpt-image-3")) {
  const qualityMap = { low: "imageGpt3Low", medium: "imageGpt3Medium", high: "imageGpt3High" };
  // ...
}
```

If the model is flat-rate (no quality levels), add it to `MODEL_TO_TIER`
(line 94) instead:

```typescript
// cost-calculator.ts  MODEL_TO_TIER
"openai:gpt-image-3": "imageGptMedium",   // or a new tier
```

### 3. Add pricing for non-image modalities (TTS / ASR)

New TTS or ASR models follow the same pattern as existing entries in
`MODEL_TO_TIER` (lines 96–101). Add `"openai:<model-id>": "<tierName>"` and,
if needed, a new tier object in `PRICING_TIERS`.

---

## Add a new chat / LLM model

Usually you do not need to do anything. The live fetch covers all models in your
account. Check the model is available in your tier at
<https://platform.openai.com/docs/models>.

A code change is needed only for these cases:

**Disable tool use for a new reasoning model prefix** — extend `hasToolSupport()`
(line 174):

```typescript
async hasToolSupport(model: string): Promise<boolean> {
  return !(
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4")   // add new reasoning prefix here
  );
}
```

**Token-based pricing** — chat models are priced via `@pydantic/genai-prices`
(imported in `cost-calculator.ts` line 19). That package is community-maintained
and tracks OpenAI pricing. If a brand-new model is missing from the catalog,
wait for a `@pydantic/genai-prices` release or pin an interim entry by adding a
dummy `MODEL_TO_TIER` key that maps to an existing tier.

---

## Verify

Run these in order after any edit:

```bash
# 1. Type-check the runtime package (and all packages)
npm run typecheck

# 2. Smoke-test the model list (requires OPENAI_API_KEY in environment)
npm run dev:nodetool -- info

# 3. Smoke-test a single image node (no secrets needed for type check)
npm run dev:nodetool -- node run nodetool.image.generate.OpenAIImageNode \
  --props '{"prompt": "a red circle", "model": {"id": "gpt-image-1", "provider": "openai"}}' \
  --no-secrets

# 4. Full check (typecheck + lint + tests)
npm run check
```

All three of `npm run typecheck`, `npm run lint`, and `npm run test` must pass
before committing.

---

## How past PRs did it

The XAI provider addition (commit `69dd6f88`, PR #3951, "Add image and video
generation support to XAI provider") is the closest parallel: it shows the exact
pattern for adding static image and video model lists to a provider that already
handles dynamic language model fetching. The files changed were
`packages/runtime/src/providers/xai-provider.ts` and
`packages/runtime/src/providers/cost-calculator.ts` — the same two files you
edit for a new OpenAI image model.

The OpenAI provider's static video list (`sora-2`, `sora-2-pro`) was added
following the same approach, visible in `getAvailableVideoModels()` at line 232
of `openai-provider.ts`.

---

## Contributing

Open a PR at <https://github.com/nodetool-ai/nodetool>. Before pushing:

```bash
npm run check   # typecheck + lint + test across all workspaces
```

Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
