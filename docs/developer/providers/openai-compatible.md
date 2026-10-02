---
layout: page
title: "OpenAI-Compatible Providers: Add a Provider or Models"
description: "How to add a new OpenAI-compatible cloud provider (Groq, Mistral, DeepSeek, etc.) or adjust an existing one's model list."
---

> **Audience:** Coding agents and contributors who want to add a new OpenAI-compatible cloud provider or change how an existing one exposes models.

This guide covers nine providers that share one implementation pattern:
**Groq**, **Mistral**, **DeepSeek**, **Moonshot (Kimi)**, **Cerebras**, **Alibaba Cloud (Qwen)**, **Cohere**, **OpenRouter**, and **Requesty**.

---

## No code needed: add an endpoint from Settings

Most OpenAI-compatible endpoints — a proxy, a company gateway, a self-hosted
router — need nothing from this guide. **Settings → Models & Providers →
OpenAI-compatible endpoints → Add endpoint** takes a name, a slug, a base URL
and an optional API key, and the provider appears in the model menu straight
away. Add as many as you like.

The slug becomes the wire id: `myproxy` → `custom_myproxy`, which is what lands
on model objects, spans and saved workflows. It is fixed once created, because
renaming it would orphan every model reference in a saved graph.

The endpoint and key are stored per account and encrypted, and they also read
from the environment under the same names — so a server can be configured with
no database writes at all:

```bash
CUSTOM_MYPROXY_BASE_URL=https://proxy.example.com/v1
CUSTOM_MYPROXY_API_KEY=sk-…
```

Include the version path the endpoint serves (usually `/v1`) in the URL, the
same way you would set `baseURL` on an OpenAI client. Models come from
`GET <base_url>/models`. Endpoints without that route take a hand-written list
of model ids instead.

An aggregator often lists chat, image and video models side by side. Each
listed model goes to the matching node pickers:

- A vendor field decides first. A `type`, `model_type`, `task`, `category` or
  `mode` naming image or video counts, as does OpenRouter-style
  `output_modalities`. A model whose output is image and text stays a chat
  model.
- Otherwise the id decides. Family names such as `flux`, `dall-e`, `seedream`
  and `imagen` mean image, and `kling`, `veo`, `sora` and `seedance` mean
  video. A model classified only by its id also stays in the chat picker, so a
  misread chat model can still be picked.
- The **Image models** and **Video models** fields in the endpoint dialog
  override both, for ids the detection misses. They are stored in the catalog
  as `image_models` and `video_models`.

Image models call `POST <base_url>/images/generations` and `/images/edits`
with the requested size passed through unchanged. Video models call the
OpenAI video API: `POST <base_url>/videos`, then poll until the clip is done.
No resolution or duration limits are declared, so the node's own options
apply. **Test** reports how many chat, image and video models the endpoint
serves, and runs on its own after each save.

| What | Path |
|------|------|
| Ids, secret names, validation | `packages/protocol/src/custom-providers.ts` |
| Chat, image and video classification | `packages/runtime/src/providers/custom-model-kinds.ts` |
| The provider | `packages/runtime/src/providers/custom-openai-provider.ts` |
| Registration | `packages/runtime/src/providers/custom-provider-registry.ts` |
| Storage + registry sync | `packages/websocket/src/custom-providers.ts` |
| API | `packages/websocket/src/trpc/routers/custom-providers.ts` (`customProviders.list\|save\|delete\|test`) |
| UI | `web/src/components/menus/CustomProvidersSection.tsx` |

Write a provider file instead when the endpoint needs more than the OpenAI
routes over a base URL: its own media API, non-standard request fields,
per-model tool support or size limits, or a curated model list that ships
with NodeTool. That is the rest of this guide.

---

## TL;DR

- Models appear automatically: each provider fetches its `/models` endpoint at runtime, so new upstream models show up in the model picker without a code change.
- Adding a whole new provider is three small edits: one constant in `@nodetool-ai/protocol`, one file of about 45 lines in `packages/runtime/src/providers/`, one `registerBuiltinProvider` call in the runtime index.
- Cohere is the only exception: it subclasses `BaseProvider` directly (embeddings only, no chat).
- Every other provider here subclasses `OpenAICompatProvider`, which owns the chat path. Moonshot (Kimi) uses the same pattern against its OpenAI-compatible endpoint, with its own `/models` fetch.

---

## Where things live

| What | Path |
|------|------|
| Provider ID constants | `packages/protocol/src/api-types.ts` (`PROVIDER_IDS` const) |
| Provider source files | `packages/runtime/src/providers/<name>-provider.ts` |
| Registration + exports | `packages/runtime/src/providers/index.ts` |
| Compat base class (chat, model listing helpers) | `packages/runtime/src/providers/openai-compat-provider.ts` |
| OpenAI base class (images, ASR, TTS, embeddings) | `packages/runtime/src/providers/openai-provider.ts` |
| Base class for all providers | `packages/runtime/src/providers/base-provider.ts` |
| Provider types (`LanguageModel`, etc.) | `packages/runtime/src/providers/types.ts` |

---

## The shared pattern

DeepSeek is the canonical example. The whole file is about 45 lines.

```ts
// packages/runtime/src/providers/deepseek-provider.ts

import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";                         // (1) inherit chat, streaming, tools
import type { LanguageModel } from "./types.js";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";     // (2) provider's OpenAI-compatible base

export class DeepSeekProvider extends OpenAICompatProvider {
  // (3) requiredSecrets() names the settings key the registry resolves at call time
  static override requiredSecrets(): string[] {
    return ["DEEPSEEK_API_KEY"];
  }

  constructor(
    secrets: { DEEPSEEK_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}               // (4) fetchFn, client, compatClient for tests
  ) {
    const apiKey = secrets.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required");
    }

    // (5) providerId labels spans and model objects; baseURL is the chat endpoint root
    super(
      { providerId: "deepseek", apiKey, baseURL: DEEPSEEK_BASE_URL },
      options
    );
  }

  // (6) export the provider-specific key to Docker/subprocess environments
  override getContainerEnv() {
    return { DEEPSEEK_API_KEY: this.apiKey };
  }

  // (7) true when the API supports function/tool calling; override per-model if mixed
  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  // (8) GET <baseURL>/models, mapped to LanguageModel rows tagged with providerId.
  // A failed request is logged and answers [] so one broken provider does not block the model menu.
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return this.listCompatModels();
  }
}
```

The config object also takes `defaultHeaders`, sent on every chat request and `/models` fetch. `OpenAICompatProvider` extends `OpenAIProvider`, so image, ASR, TTS, and embedding surfaces are inherited. Those return empty lists unless the subclass declares its own catalog (see `servesOpenAICatalog()` in the [OpenAI guide](openai.md)).

Groq, Mistral, Cerebras, Moonshot, and Alibaba Cloud follow this pattern. Differences:

- **Alibaba Cloud** reads `DASHSCOPE_API_KEY`. The base URL defaults to the international DashScope endpoint, `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`. A key from another region needs `DASHSCOPE_BASE_URL` set to that region's `/compatible-mode/v1` URL. `hasToolSupport` returns `false` for families DashScope excludes from function calling (`qwen-math`, `qvq`, `qwen-vl-ocr`, `qwen-mt`, audio, TTS, and embedding ids). The provider sends `max_tokens` in place of `max_completion_tokens`.
- **Groq** annotates request failures with a token estimate and detects context-exceeded errors (`groq-request.ts`).
- **Moonshot** reads `KIMI_API_KEY`, targets `https://api.moonshot.ai/v1`, and fetches `/models` itself.
- **OpenRouter** sends attribution headers (`HTTP-Referer`, `X-Title`) through `defaultHeaders`. It adds image, video, TTS, ASR, and embedding methods, and `hasToolSupport` returns `false` for ids containing `o1` or `o3`.
- **Requesty** sends the same attribution headers and builds its model list from `/models/managed` followed by `/models`, keeping only rows whose `api` is `"chat"`. It reads `supports_tool_calling` per model, and only an explicit `false` disables tools.

---

## Add a brand-new OpenAI-compatible provider

### Step 1 — Add the provider ID to `@nodetool-ai/protocol`

Open `packages/protocol/src/api-types.ts` and add a key to `PROVIDER_IDS`:

```ts
// packages/protocol/src/api-types.ts

export const PROVIDER_IDS = {
  // ... existing entries ...
  ACME: "acme",                   // wire id — used in model objects, spans, settings
} as const;
```

The comment above the const says: "Adding a provider? Add it here first, then register it in `@nodetool-ai/runtime`'s provider index." Follow that order.

Build the protocol package so downstream packages see the new constant:

```bash
cd packages/protocol && npm run build
```

### Step 2 — Write `acme-provider.ts`

Create `packages/runtime/src/providers/acme-provider.ts`. Copy the DeepSeek template above and substitute:

| Placeholder | Replace with |
|-------------|--------------|
| `DeepSeek` | `Acme` |
| `DEEPSEEK_API_KEY` | `ACME_API_KEY` |
| `DEEPSEEK_BASE_URL` / `https://api.deepseek.com/v1` | ACME's base URL |
| `"deepseek"` (the wire id string) | `"acme"` |

If the provider's `/models` response uses a different shape (not `{ data: [{ id, name }] }`), replace `listCompatModels()` with your own parser. `fetchCompatModelRows(url)` returns the raw rows when you need vendor fields.

If the provider does not support tool calling for some or all models, implement `hasToolSupport` to return `false` where appropriate (see the OpenRouter implementation for a model-name heuristic).

### Step 3 — Export and register in `packages/runtime/src/providers/index.ts`

Two lines:

```ts
// near the other thin-provider imports
import { AcmeProvider } from "./acme-provider.js";

// near the other exports
export { AcmeProvider };
```

And one `registerBuiltinProvider` call in the registration block, before the local-only `if (!_cloudProfile)` section:

```ts
registerBuiltinProvider(PROVIDER_IDS.ACME, AcmeProvider, { ACME_API_KEY: "" });
```

The empty string for `ACME_API_KEY` is intentional — it forces the registry to resolve the key from the DB or env on every `getProvider()` call rather than baking a stale value at module load.

---

## Adjust an existing provider's models

### Chat models are fetched dynamically — no change needed

If Groq, DeepSeek, Mistral, Cerebras, Alibaba Cloud, OpenRouter, or Requesty adds a new chat model, it appears in the model picker automatically on the next call to `getAvailableLanguageModels()`. No code change is required.

### Tool-support overrides

`hasToolSupport(model: string)` controls whether the UI offers tool/function calling for a given model. Groq, Mistral, Cerebras, DeepSeek, and Moonshot return `true` unconditionally. OpenRouter, Alibaba Cloud, and Requesty decide per model. OpenRouter checks the model id:

```ts
// packages/runtime/src/providers/openrouter-provider.ts
override async hasToolSupport(model: string): Promise<boolean> {
  const lower = model.toLowerCase();
  if (lower.includes("o1") || lower.includes("o3")) return false;
  return true;
}
```

Apply the same pattern to any other provider where some models lack tool support.

### Embedding models (Mistral)

Mistral is the only provider here that subclasses `OpenAICompatProvider` and also lists embeddings (OpenRouter lists embeddings from its own catalog). The model list is static (one entry, `mistral-embed`) and lives in `getAvailableEmbeddingModels()` in `packages/runtime/src/providers/mistral-provider.ts`. To add an embedding model, append to that array.

### Cohere — embeddings-only, different base class

Cohere subclasses `BaseProvider` directly, not `OpenAICompatProvider`. It has no chat support. Its embedding model list is the static `COHERE_EMBEDDING_MODELS` array at the top of `packages/runtime/src/providers/cohere-provider.ts`. Append there to add a new Cohere embedding model.

### Moonshot

Moonshot fetches `GET https://api.moonshot.ai/v1/models` live, so new Kimi models need no code change.

---

## Verify

After any change:

**1. Build protocol if you changed `api-types.ts`.**

```bash
cd packages/protocol && npm run build
```

**2. Type-check.**

```bash
npm run typecheck
```

**3. Confirm the provider returns models** (requires the API key in secrets or env).

```bash
npm run dev:nodetool -- models by-provider acme --kind llm
```

Or run a single chat to exercise the full path:

```bash
npm run dev:chat -- --provider acme --model <model-id>
```

**4. Single-node smoke test** (chat node via the provider).

```bash
npm run dev:nodetool -- node run nodetool.agents.Agent \
  --props '{"prompt":"hello","model":{"type":"language_model","provider":"acme","id":"<model-id>"}}'
```

**5. Affected tests, lint, and the harness gate.**

```bash
npm run test:affected
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

---

## Contributing

- Repository: <https://github.com/nodetool-ai/nodetool>
- Discord: <https://discord.gg/WmQTWZRcYE>
- Run the Verify steps above before opening a PR.
- Follow [docs/WRITING_STYLE.md](https://github.com/nodetool-ai/nodetool/blob/main/docs/WRITING_STYLE.md) for any Markdown you touch.
