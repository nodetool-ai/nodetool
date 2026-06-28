---
layout: page
title: "Ollama: Add Models"
description: "How to add local Ollama models to NodeTool and how to change provider-level behavior such as tool-support detection."
---

The Ollama provider connects NodeTool to a local [Ollama](https://ollama.com) daemon. Models are discovered dynamically from the running daemon — no code change is needed to add a new model. Provider-level changes (tool detection, embedding behavior, URL configuration) require editing the provider source.

> **Audience:** coding agents and contributors — both users adding local models and devs modifying the provider.

---

## TL;DR

```bash
ollama pull llama3.2          # makes the model appear in NodeTool automatically
ollama pull nomic-embed-text  # embedding models work the same way
```

No code change. No restart required (NodeTool queries the daemon on every model-list call). If you need to change tool-support detection, the default URL, or `keep_alive` behavior, see [Provider-level changes](#provider-level-changes-dev-path) below.

---

## Where things live

| Concern | Path |
|---|---|
| Provider implementation | `packages/runtime/src/providers/ollama-provider.ts` |
| Default daemon URL | `packages/runtime/src/providers/defaults.ts` (`OLLAMA_DEFAULT_URL`) |
| Registration + `optionalKwargs` | `packages/runtime/src/providers/index.ts` (lines 248–253) |
| Provider registry resolution logic | `packages/runtime/src/providers/provider-registry.ts` |

---

## How Ollama models are discovered

`OllamaProvider.getAvailableLanguageModels()` (line 357 of `ollama-provider.ts`) fetches `GET {apiUrl}/api/tags` from the local daemon on every call. It maps each entry's `model` field (falling back to `name`) to a `LanguageModel` record:

```typescript
// packages/runtime/src/providers/ollama-provider.ts:357-372
async getAvailableLanguageModels(): Promise<LanguageModel[]> {
  const response = await this._fetch(`${this.apiUrl}/api/tags`);
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    models?: Array<{ name?: string; model?: string }>;
  };
  ...
}
```

`getAvailableEmbeddingModels()` (line 374) calls `getAvailableLanguageModels()` and re-wraps every result as an `EmbeddingModel` with `dimensions: 0`. Ollama does not advertise context size or dimensions over `/api/tags`, so both methods surface all pulled models regardless of type. The caller (RAG pipeline, agent config) is responsible for picking an appropriate model.

**URL resolution order** (highest priority first):

1. Secret store — key `OLLAMA_API_URL` (set via `nodetool secrets store OLLAMA_API_URL` or Settings → API Keys)
2. Environment variable — `OLLAMA_API_URL`
3. Registered default — `http://127.0.0.1:11434` (`OLLAMA_DEFAULT_URL` in `defaults.ts`)

The registration in `index.ts` uses an `optionalKwarg` for `OLLAMA_API_URL` so the registry always considers Ollama "configured" (no key required) while still resolving a user-set URL on every `getProvider()` call without a restart.

```typescript
// packages/runtime/src/providers/index.ts:248-253
registerBuiltinProvider(
  PROVIDER_IDS.OLLAMA,
  OllamaProvider,
  {},
  { OLLAMA_API_URL: OLLAMA_DEFAULT_URL }
);
```

Ollama is registered only when `NODETOOL_ENV !== "production"` (lines 241–282 of `index.ts`). In production/cloud deployments the provider is pruned from the registry.

The constructor also reads `OLLAMA_KEEP_ALIVE` from `process.env`. Default is `"10m"`. Set it to `"-1"` to keep models resident indefinitely, or `"0"` to unload immediately after each request.

---

## Add a model (user path)

Pull the model with the Ollama CLI:

```bash
# Language models
ollama pull llama3.2
ollama pull gemma3:27b
ollama pull phi4
ollama pull deepseek-r1:8b

# Embedding models
ollama pull nomic-embed-text
ollama pull mxbai-embed-large

# Vision models (multimodal)
ollama pull llava:13b
ollama pull minicpm-v
```

NodeTool picks up the model on the next call to `getAvailableLanguageModels()` or `getAvailableEmbeddingModels()` — no restart needed. The model ID passed to the provider must match the tag exactly as shown by `ollama list` (e.g. `llama3.2:latest`, `gemma3:27b`).

**To point NodeTool at a non-default Ollama instance** (remote host, different port):

```bash
npm run dev:nodetool -- secrets store OLLAMA_API_URL
# Paste the URL when prompted, e.g.: http://192.168.1.10:11434
```

Or set the environment variable before starting the server:

```bash
OLLAMA_API_URL=http://192.168.1.10:11434 npm run dev
```

---

## Provider-level changes (dev path)

Edit `packages/runtime/src/providers/ollama-provider.ts`. The main extension points:

### Tool-support detection

`hasToolSupport(model)` (line 129) queries `POST {apiUrl}/api/show` and checks for `"tools"` in the `capabilities` array. It caches results in `_modelInfoCache` (a `Map<string, Record<string, unknown>>`). When the `/api/show` call fails or the model has no `capabilities` field, it defaults to `true`.

If a model reports no tool support, `generateMessage` and `generateMessages` fall back to `_injectToolEmulationPrompt` + `_parseEmulatedToolCalls`, which inject tool descriptions into the system prompt and parse `function_name(param='value')` patterns from the output.

To override detection for a specific model (e.g. a model that advertises tools but calls them incorrectly), add a guard at the top of `hasToolSupport`:

```typescript
if (model.startsWith("my-broken-model")) return false;
```

### Embedding dimensions

`getAvailableEmbeddingModels()` returns `dimensions: 0` for every model because Ollama's `/api/tags` response does not include that field. If you need accurate dimensions, query `POST /api/show` for the pulled model and read `model_info["embedding_length"]`. The `_modelInfoCache` already stores the full `/api/show` response, so the call is free on the second access.

### Keep-alive

Change the default (currently `"10m"`) by editing the fallback in the constructor:

```typescript
// packages/runtime/src/providers/ollama-provider.ts:109-110
const keepAlive = process.env.OLLAMA_KEEP_ALIVE?.trim();
this.keepAlive = keepAlive && keepAlive.length > 0 ? keepAlive : "10m";
```

### Default URL

Change `OLLAMA_DEFAULT_URL` in `packages/runtime/src/providers/defaults.ts`. The constant is re-exported from `packages/runtime/src/providers/index.ts` so callers import it as `@nodetool-ai/runtime`.

---

## Verify

```bash
# 1. Confirm the daemon is running and a model is present
curl http://127.0.0.1:11434/api/tags

# 2. Type-check the provider package
npm run typecheck --workspace=packages/runtime

# 3. Run a single Ollama-backed node (replace model with one you have pulled)
npm run dev:nodetool -- node run nodetool.text.Generate \
  --props '{"prompt":"hello","provider":"ollama","model":"llama3.2:latest"}'

# 4. Full suite
npm run check
```

If the daemon is not running, `getAvailableLanguageModels()` returns `[]` silently (the provider guards `if (!response.ok) return []`). Check that `ollama serve` (or the Ollama desktop app) is running before debugging further.

---

## How past commits did it

The provider file was first tracked in commit **`d1491abf`** ("add claude agent package"), which established the provider registration pattern, the `optionalKwargs` mechanic for `OLLAMA_API_URL`, and the `NODETOOL_ENV !== "production"` guard for local-only providers.

Commit **`364620b4`** (PR #3969, "Add failure diagnosis, cassette recording, and plan caching") is the most recent change touching `packages/runtime/src/providers/index.ts`; the Ollama registration block was unchanged, confirming the zero-required-kwarg pattern is stable.

---

## Contributing

PRs welcome at <https://github.com/nodetool-ai/nodetool>. Before pushing:

```bash
npm run lint        # must pass
npm run typecheck   # must pass
```

Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
