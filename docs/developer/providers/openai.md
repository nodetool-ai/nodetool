---
layout: page
title: "OpenAI: Add Models"
description: "How to add new OpenAI models to NodeTool — chat models appear automatically; image models require a one-line code edit."
---

NodeTool's OpenAI integration lives in one file:
`packages/runtime/src/providers/openai-provider.ts`.
The provider is registered under `PROVIDER_IDS.OPENAI = "openai"` in
`packages/protocol/src/api-types.ts`.

> **Audience:** coding agents and contributors adding new OpenAI models.

---

## TL;DR

| Model type | What to do |
|---|---|
| Chat / LLM (e.g. `gpt-5.6`) | Nothing. The list is fetched live from `https://api.openai.com/v1/models` and filtered to the gpt-5 family. Add the id to `OPENAI_FALLBACK_MODELS` if it should show offline |
| Image (e.g. `gpt-image-3`) | Add one entry to `getAvailableImageModels()` and a pricing rule in `cost-calculator.ts` |
| Video (e.g. `sora-3`) | Add one entry to `getAvailableVideoModels()` |
| TTS / ASR / Embedding | Add one entry to the matching static getter |

---

## Where things live

| Concern | Path | Notes |
|---|---|---|
| Provider class | `packages/runtime/src/providers/openai-provider.ts` | All model lists and API calls |
| Provider ID constant | `packages/protocol/src/api-types.ts` | `PROVIDER_IDS.OPENAI = "openai"` |
| Provider registration | `packages/runtime/src/providers/index.ts` | Imports and re-exports `OpenAIProvider` |
| Non-token pricing tiers | `packages/runtime/src/providers/cost-calculator.ts` | `PRICING_TIERS` object |
| Per-model tier mapping | `packages/runtime/src/providers/cost-calculator.ts` | `MODEL_TO_TIER` object |
| Quality-based image cost | `packages/runtime/src/providers/cost-calculator.ts` | `gptImageQualityTier()`, `gptImage25TokenCost()`, `calculateImageCost()` |

---

## How OpenAI models are defined

### Chat / LLM models — dynamic

`getAvailableLanguageModels()` makes a live `GET` request to
`https://api.openai.com/v1/models` using the stored API key, then maps the
returned ids to `LanguageModel` objects:

```typescript
async getAvailableLanguageModels(): Promise<LanguageModel[]> {
  const isOpenAI = this.provider === PROVIDER_IDS.OPENAI;
  const response = await this._fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${this.apiKey}` }
  });
  if (!response.ok) return isOpenAI ? OPENAI_FALLBACK_MODELS : [];
  let models: LanguageModel[];
  try {
    models = decodeOpenAIModelList(await response.json(), {
      provider: this.provider,
      onlyResponsesModels: isOpenAI
    });
  } catch {
    return isOpenAI ? OPENAI_FALLBACK_MODELS : [];
  }
  return models.length === 0 && isOpenAI ? OPENAI_FALLBACK_MODELS : models;
}
```

Two filters shape the result. `isOpenAIResponsesModel()` keeps only the gpt-5
family — everything older (`gpt-4o`, `gpt-4.1`, the o-series) is retired on the
`openai` provider, and audio/realtime/transcribe variants are excluded because
the Responses API doesn't serve them. OpenAI-compatible subclasses set their own
provider id, skip the filter, and keep their full catalog.

When the request fails or returns nothing, the provider falls back to
`OPENAI_FALLBACK_MODELS`: `gpt-6-astra`, `gpt-5.6` (plus `-sol`, `-terra`, `-luna`), `gpt-5.5`,
`gpt-5.5-pro`, `gpt-5.4` with its `-pro`/`-mini`/`-nano` tiers, and `gpt-5`,
`gpt-5-mini`, `gpt-5-nano`. Add new releases there so they show up before a
successful live fetch. A response body without a `data` array also triggers the fallback.

A new gpt-5-family chat model released by OpenAI appears in NodeTool
automatically the next time the model list is refreshed — no code change needed.

**Tool support** is controlled by `hasToolSupport()`:

```typescript
async hasToolSupport(model: string): Promise<boolean> {
  if (this.usesResponsesApi(model)) return true;
  return !(model.startsWith("o1") || model.startsWith("o3"));
}
```

Responses-API models always support tools. If a Chat Completions model on a
compatible subclass needs to opt out, add its prefix here.

### Image, video, TTS, ASR, and embedding models — static

These model types are returned from hardcoded lists inside the provider because
OpenAI's `/v1/models` endpoint does not distinguish modalities. Each getter
returns an array of typed objects.

`getAvailableImageModels()` lists `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst`,
`gpt-image-2`, `gpt-image-1.5`, `gpt-image-1`, and `gpt-image-1-mini`.

`getAvailableVideoModels()` lists `sora-2` and `sora-2-pro`, with the durations,
resolutions, and aspect ratios each accepts.

`getAvailableTTSModels()` (`gpt-4o-mini-tts`, `tts-1`, `tts-1-hd`),
`getAvailableASRModels()` (`gpt-4o-transcribe`, `gpt-4o-mini-transcribe`,
`gpt-4o-transcribe-diarize`, `whisper-1`), and `getAvailableEmbeddingModels()`
(`text-embedding-3-small`, `text-embedding-3-large`, `text-embedding-ada-002`)
follow the same pattern.

The OpenAI-compatible subclasses inherit this class but not its lineup. Every
static getter returns an empty list unless `servesOpenAICatalog()` is true, which
holds only for the `openai` provider id. Subclasses that serve media (Together,
MiniMax, xAI, and others) override the getters with their own catalog.

---

## Add a new image model

### 1. Add the entry to `getAvailableImageModels()`

Open `packages/runtime/src/providers/openai-provider.ts` and add to the array
returned by the method. Match the shape of existing entries exactly:

```typescript
// packages/runtime/src/providers/openai-provider.ts
async getAvailableImageModels(): Promise<ImageModel[]> {
  if (!this.servesOpenAICatalog()) return [];
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

`supportedTasks` is a free string array. Existing image entries use `"text_to_image"` and `"image_to_image"`.
use whichever the model actually supports.

### 2. Add pricing if quality-based

`CostCalculator.calculate()` resolves image models before the generic tier
lookup. `gptImageQualityTier()` matches the `gpt-image-1` family (`gpt-image-1`
and `gpt-image-1-mini`, via `/^gpt-image-1(?:$|-)/`) when an image count is
reported and routes it through quality tiers in `PRICING_TIERS`. The default
quality is `medium`. `gptImage25TokenCost()` prices `gpt-image-2.5-flare` and
`gpt-image-2.5-sunburst` per token with rates written inline. `calculateImageCost()`
is a thin wrapper over `calculate()`.

```typescript
// cost-calculator.ts  PRICING_TIERS
imageGptLow:    { costType: CostType.IMAGE_BASED, perImage: 0.011 },
imageGptMedium: { costType: CostType.IMAGE_BASED, perImage: 0.042 },
imageGptHigh:   { costType: CostType.IMAGE_BASED, perImage: 0.167 },
```

If `gpt-image-3` uses the same three-tier structure at different prices, add
new tiers and extend the `qualityMap` inside `gptImageQualityTier()`:

```typescript
// cost-calculator.ts  PRICING_TIERS — add new tiers
imageGpt3Low:    { costType: CostType.IMAGE_BASED, perImage: 0.015 },
imageGpt3Medium: { costType: CostType.IMAGE_BASED, perImage: 0.060 },
imageGpt3High:   { costType: CostType.IMAGE_BASED, perImage: 0.200 },
```

Then branch on the model id before the existing regex test:

```typescript
// cost-calculator.ts  gptImageQualityTier()
if (lower.includes("gpt-image-3")) {
  const qualityMap = { low: "imageGpt3Low", medium: "imageGpt3Medium", high: "imageGpt3High" };
  // ...
}
```

If the model is flat-rate (no quality levels), add it to `MODEL_TO_TIER`
instead:

```typescript
// cost-calculator.ts  MODEL_TO_TIER
"openai:gpt-image-3": "imageGptMedium",   // or a new tier
```

### 3. Add pricing for non-image modalities (TTS / ASR)

New TTS or ASR models follow the same pattern as existing entries in
`MODEL_TO_TIER`. Add `"openai:<model-id>": "<tierName>"` and,
if needed, a new tier object in `PRICING_TIERS`.

---

## Add a new chat / LLM model

Usually you do not need to do anything. The live fetch covers all models in your
account. Check the model is available in your tier at
<https://platform.openai.com/docs/models>.

A code change is needed only for these cases:

**Disable tool use for a new reasoning model prefix** — extend `hasToolSupport()`
in `openai-provider.ts`:

```typescript
async hasToolSupport(model: string): Promise<boolean> {
  if (this.usesResponsesApi(model)) return true;
  return !(
    model.startsWith("o1") ||
    model.startsWith("o3")   // add new prefix here
  );
}
```

**Token-based pricing** — chat models are priced via `@pydantic/genai-prices`
(imported in `cost-calculator.ts`). That package is community-maintained
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
npm run dev:nodetool -- models by-provider openai --kind llm
npm run dev:nodetool -- models by-provider openai --kind image

# 3. Smoke-test a single image node (no secrets needed for type check)
npm run dev:nodetool -- node run nodetool.image.TextToImage \
  --props '{"prompt": "a red circle", "model": {"type": "image_model", "id": "gpt-image-1", "provider": "openai"}}' \
  --no-secrets

# 4. Affected tests, lint, and the harness gate
npm run test:affected
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

All of these must pass before committing.

---

## Contributing

Open a PR at <https://github.com/nodetool-ai/nodetool>. Before pushing:

```bash
npm run test:affected
npm run typecheck
npm run lint
```

Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
