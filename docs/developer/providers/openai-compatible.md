---
layout: page
title: "OpenAI-Compatible Providers: Add a Provider or Models"
description: "How to add a new OpenAI-compatible cloud provider (Groq, Mistral, DeepSeek, etc.) or adjust an existing one's model list."
---

> **Audience:** Coding agents and contributors who want to add a new OpenAI-compatible cloud provider or change how an existing one exposes models.

This guide covers seven providers that share one implementation pattern:
**Groq**, **Mistral**, **DeepSeek**, **Moonshot (Kimi)**, **Cerebras**, **Cohere**, and **OpenRouter**.

---

## TL;DR

- Models appear automatically: each provider fetches its `/models` endpoint at runtime, so new upstream models show up in the model picker without a code change.
- Adding a whole new provider is three small edits: one constant in `@nodetool-ai/protocol`, one `~90-line` file in `packages/runtime/src/providers/`, one `registerBuiltinProvider` call in the runtime index.
- Cohere is the only exception: it subclasses `BaseProvider` directly (embeddings only, no chat).
- Moonshot is another exception: it subclasses `AnthropicProvider` (Kimi exposes an Anthropic-compatible endpoint, not OpenAI).

---

## Where things live

| What | Path |
|------|------|
| Provider ID constants | `packages/protocol/src/api-types.ts` (`PROVIDER_IDS` const, line 858) |
| Provider source files | `packages/runtime/src/providers/<name>-provider.ts` |
| Registration + exports | `packages/runtime/src/providers/index.ts` |
| OpenAI base class | `packages/runtime/src/providers/openai-provider.ts` |
| Base class for all providers | `packages/runtime/src/providers/base-provider.ts` |
| Provider types (`LanguageModel`, etc.) | `packages/runtime/src/providers/types.ts` |

---

## The shared pattern

DeepSeek is the canonical example. The full 93-line file is annotated below.

```ts
// packages/runtime/src/providers/deepseek-provider.ts

import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";        // (1) inherit chat, streaming, tools
import type { LanguageModel } from "./types.js";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";     // (2) provider's OpenAI-compatible base

interface DeepSeekProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;                                     // (3) injected for testability
}

export class DeepSeekProvider extends OpenAIProvider {
  // (4) requiredSecrets() names the env/DB key the registry resolves at call time
  static override requiredSecrets(): string[] {
    return ["DEEPSEEK_API_KEY"];
  }

  private _deepseekFetch: typeof fetch;

  constructor(
    secrets: { DEEPSEEK_API_KEY?: string },
    options: DeepSeekProviderOptions = {}
  ) {
    const apiKey = secrets.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    // (5) pass key as OPENAI_API_KEY; supply a clientFactory that sets baseURL
    super(
      { OPENAI_API_KEY: apiKey },
      {
        client: options.client,
        clientFactory:
          options.clientFactory ??
          ((key) => new OpenAI({ apiKey: key, baseURL: DEEPSEEK_BASE_URL })),
        fetchFn
      }
    );

    // (6) override the `provider` field so spans and model objects carry the right id
    (this as { provider: string }).provider = "deepseek";
    this._deepseekFetch = fetchFn;
  }

  // (7) export the provider-specific key to Docker/subprocess environments
  override getContainerEnv(): Record<string, string> {
    return { DEEPSEEK_API_KEY: this.apiKey };
  }

  // (8) true when the API supports function/tool calling; override per-model if mixed
  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  // (9) fetch the live model list; return [] on failure (graceful degradation)
  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._deepseekFetch(
      `${DEEPSEEK_BASE_URL}/models`,
      { headers: { Authorization: `Bearer ${this.apiKey}` } }
    );
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    const rows = payload.data ?? [];
    return rows
      .filter(
        (row): row is { id: string; name?: string } =>
          typeof row.id === "string" && row.id.length > 0
      )
      .map((row) => ({ id: row.id, name: row.name ?? row.id, provider: "deepseek" }));
  }
}
```

Groq, Mistral, Cerebras, and OpenRouter follow this pattern exactly. OpenRouter adds a few extras: `defaultHeaders` on the `OpenAI` client (HTTP-Referer, X-Title), `textToImage`, and a `hasToolSupport` override that returns `false` for o1/o3 model IDs.

---

## Add a brand-new OpenAI-compatible provider

### Step 1 — Add the provider ID to `@nodetool-ai/protocol`

Open `packages/protocol/src/api-types.ts` and add a key to `PROVIDER_IDS`:

```ts
// packages/protocol/src/api-types.ts  (around line 858)

export const PROVIDER_IDS = {
  // ... existing entries ...
  ACME: "acme",                   // wire id — used in model objects, spans, settings
} as const;
```

The comment above the const (line 855) says: "Adding a provider? Add it here first, then register it in `@nodetool-ai/runtime`'s provider index." Follow that order.

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
| `this._deepseekFetch` | `this._acmeFetch` |

If the provider's `/models` response uses a different shape (not `{ data: [{ id, name }] }`), adjust the `getAvailableLanguageModels` parser accordingly.

If the provider does not support tool calling for some or all models, implement `hasToolSupport` to return `false` where appropriate (see the OpenRouter implementation for a model-name heuristic).

### Step 3 — Export and register in `packages/runtime/src/providers/index.ts`

Two lines:

```ts
// near the other thin-provider imports
import { AcmeProvider } from "./acme-provider.js";

// near the other exports
export { AcmeProvider };
```

And one `registerBuiltinProvider` call in the registration block (around line 199):

```ts
registerBuiltinProvider(PROVIDER_IDS.ACME, AcmeProvider, { ACME_API_KEY: "" });
```

The empty string for `ACME_API_KEY` is intentional — it forces the registry to resolve the key from the DB or env on every `getProvider()` call rather than baking a stale value at module load.

---

## Adjust an existing provider's models

### Chat models are fetched dynamically — no change needed

If Groq, DeepSeek, Mistral, Cerebras, or OpenRouter adds a new chat model, it appears in the model picker automatically on the next call to `getAvailableLanguageModels()`. No code change is required.

### Tool-support overrides

`hasToolSupport(model: string)` controls whether the UI offers tool/function calling for a given model. All five OpenAI-subclass providers currently return `true` unconditionally. OpenRouter overrides per-model-id:

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

Mistral is the only OpenAI-subclass provider that also exposes embeddings. The model list is static (one entry, `mistral-embed`) and lives in `getAvailableEmbeddingModels()` in `packages/runtime/src/providers/mistral-provider.ts`. To add an embedding model, append to that array.

### Cohere — embeddings-only, different base class

Cohere subclasses `BaseProvider` directly, not `OpenAIProvider`. It has no chat support. Its embedding model list is the static `COHERE_EMBEDDING_MODELS` array at the top of `packages/runtime/src/providers/cohere-provider.ts`. Append there to add a new Cohere embedding model.

### Moonshot — Anthropic-compatible endpoint

Moonshot subclasses `AnthropicProvider` and uses a hardcoded `knownModels` list in `getAvailableLanguageModels()` (not a live fetch). To add a Kimi model, add its id to that array in `packages/runtime/src/providers/moonshot-provider.ts`.

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
npm run dev:nodetool -- info --json | grep acme
```

Or run a single chat to exercise the full path:

```bash
npm run dev:chat -- --provider acme --model <model-id>
```

**4. Single-node smoke test** (chat node via the provider).

```bash
npm run dev:nodetool -- node run nodetool.text.TextGenerationNode \
  --props '{"provider":"acme","model":"<model-id>","prompt":"hello"}'
```

**5. Full suite.**

```bash
npm run check
```

---

## How past PRs did it

**Commit `25b0623f`** (merged as PR #3377) introduced the five OpenAI-subclass providers in one shot. It added:

- `packages/runtime/src/providers/cerebras-provider.ts` (85 lines)
- `packages/runtime/src/providers/cohere-provider.ts` (162 lines)
- `packages/runtime/src/providers/deepseek-provider.ts` (92 lines)
- `packages/runtime/src/providers/groq-provider.ts` (85 lines)
- `packages/runtime/src/providers/mistral-provider.ts` (115 lines)
- `packages/runtime/src/providers/moonshot-provider.ts` (65 lines)
- `packages/runtime/src/providers/openrouter-provider.ts` (225 lines, with image-gen extras)

All seven were wired into `index.ts` in that same commit. To see the full diff: `git show 25b0623f`.

**Commit `34599547`** ("refactor(providers): centralize provider IDs in protocol") moved provider id strings out of scattered literals and into `PROVIDER_IDS` in `@nodetool-ai/protocol`. Any new provider follows the post-refactor convention: constant in protocol, `PROVIDER_IDS.X` everywhere else.

---

## Contributing

- Repository: <https://github.com/nodetool-ai/nodetool>
- Discord: <https://discord.gg/WmQTWZRcYE>
- Run `npm run check` (typecheck + lint + tests) before opening a PR. PRs that break any of the three will not merge.
- Follow [docs/WRITING_STYLE.md](https://github.com/nodetool-ai/nodetool/blob/main/docs/WRITING_STYLE.md) for any Markdown you touch.
