---
layout: page
title: "Local Inference (LM Studio, llama.cpp, vLLM): Add Models"
description: "How to run local OpenAI-compatible inference servers with NodeTool — URL config, model discovery, and provider code paths."
---

NodeTool ships three providers that talk to a local OpenAI-compatible HTTP server (a fourth, `node_llama_cpp`, runs in-process and is covered below): **LM Studio**, **llama.cpp** (`llama_cpp`), and **vLLM**. All three follow the same pattern: point NodeTool at the server's base URL, load a model in the server, and the model appears in the UI automatically via a `/v1/models` fetch.

> **Audience:** coding agents and contributors adding local models to NodeTool, or changing these providers' code.

---

## TL;DR

1. Start the local server and load a model.
2. Set the server's base URL (env var or Settings → API Keys).
3. Models appear in NodeTool automatically — no code change needed.

The only time you touch code is when you are changing provider behavior (URL resolution, message normalization, tool-call handling) — see [Provider-level changes](#provider-level-changes-dev-path).

---

## Where things live

| Concern | Path |
|---|---|
| LM Studio provider | `packages/runtime/src/providers/lmstudio-provider.ts` |
| llama.cpp provider | `packages/runtime/src/providers/llama-provider.ts` |
| vLLM provider | `packages/runtime/src/providers/vllm-provider.ts` |
| Default base URLs | `packages/runtime/src/providers/defaults.ts` |
| Provider registration block | `packages/runtime/src/providers/index.ts`, the local-only `if (!_cloudProfile)` block |

---

## How models are discovered

Each provider implements `getAvailableLanguageModels()`, which calls `GET <baseURL>/v1/models` at runtime. The response shape is the standard OpenAI list:

```json
{ "data": [{ "id": "model-name" }, ...] }
```

llama.cpp also accepts a `models` top-level key as a fallback (`payload.data ?? payload.models ?? []`). The provider maps each `id` to a `LanguageModel` record; no static list exists in the codebase. Loading a new model in the server makes it visible in NodeTool on the next model-list refresh.

**URL resolution order** (all three providers):

1. `options.baseURL` (constructor arg — tests only)
2. Secret store / env var (`LMSTUDIO_API_URL` / `LLAMA_CPP_URL` / `VLLM_BASE_URL`)
3. Hard-coded default (LM Studio only — `http://127.0.0.1:1234`; llama.cpp and vLLM throw if unset)

Trailing slashes are stripped before `/v1` is appended.

**Default ports:**

| Server | Default URL |
|---|---|
| LM Studio | `http://127.0.0.1:1234` (defined in `defaults.ts`) |
| llama.cpp | none — must be set |
| vLLM | none — must be set |

---

## Registration

All three are registered in `packages/runtime/src/providers/index.ts` inside a guard that skips the cloud profile — `isCloudProfileActive()` reads `NODETOOL_NODE_PROFILE` and `NODETOOL_ENV`, so a self-hosted deployment setting `NODETOOL_NODE_PROFILE=full` keeps them registered while the commercial cloud does not:

```typescript
if (!_cloudProfile) {
  registerBuiltinProvider(
    PROVIDER_IDS.LMSTUDIO,
    LMStudioProvider,
    {},
    { LMSTUDIO_API_URL: LMSTUDIO_DEFAULT_URL, LMSTUDIO_API_KEY: "lm-studio" },
    { access: "local_service", displayName: "LM Studio" }
  );
  registerBuiltinProvider(
    PROVIDER_IDS.LLAMA_CPP,
    LlamaProvider,
    { LLAMA_CPP_URL: "" },
    {},
    { access: "local_service", displayName: "llama.cpp server" }
  );
  registerBuiltinProvider(
    PROVIDER_IDS.VLLM,
    VLLMProvider,
    { VLLM_BASE_URL: "" },
    { VLLM_API_KEY: "sk-no-key-required" },
    { access: "local_service", displayName: "vLLM" }
  );
}
```

The third argument is the required kwargs. An empty value for a required key (`LLAMA_CPP_URL`, `VLLM_BASE_URL`) keeps the provider unavailable until the user sets it. The fourth argument is `optionalKwargs`, settings re-resolved from the secret store and then the environment on every `getProvider()` call without blocking `isProviderConfigured()`. That is why LM Studio works by default (the URL has a fallback). The fifth argument sets the provider's access kind and display name.

---

## Per-server setup

### LM Studio

**Env var / settings key:** `LMSTUDIO_API_URL`  
**Default URL:** `http://127.0.0.1:1234`  
**API key:** `lm-studio` (hard-coded default; override with `LMSTUDIO_API_KEY`)

LM Studio's OpenAI-compatible server starts when you enable it in LM Studio → Local Server. Once running, NodeTool connects automatically with no URL config needed.

To use a different port:

```bash
# In your shell environment, or via Settings → API Keys
export LMSTUDIO_API_URL=http://127.0.0.1:8080
```

Or in the chat CLI:

```bash
npm run dev:chat -- --provider lmstudio --model <model-id>
```

Tool calls are always reported as supported (`hasToolSupport` returns `true`); whether a specific model actually handles them depends on the model.

### llama.cpp

**Env var / settings key:** `LLAMA_CPP_URL` (required — no default)  
**API key:** none (`sk-no-key-required` is sent automatically)

Start the llama.cpp HTTP server:

```bash
./llama-server --model /path/to/model.gguf --port 8080 --ctx-size 4096
```

Then set the URL:

```bash
export LLAMA_CPP_URL=http://127.0.0.1:8080
```

`llama-server` constrains generation with a grammar built from the tool schemas, so tool calling is native for any model it serves. `LlamaProvider` returns `true` from `hasToolSupport` and does no prompt-level emulation.

`LlamaProvider` extends `OpenAICompatProvider`, which supplies the chat path, sampling parameters, usage tracking, and message normalization — the same code LM Studio and vLLM ride. The provider itself only handles URL resolution, model listing, and context-length error detection.

### llama.cpp in-process (`node_llama_cpp`)

`NodeLlamaCppProvider` (`node-llama-cpp-provider.ts`) runs GGUF models inside the NodeTool process through the optional `node-llama-cpp` native binding. It needs no server and no secret. It lists GGUF files from the models directory, and from the Hugging Face hub cache. The directory comes from `NODE_LLAMA_CPP_MODELS_DIR` and defaults to the shared llama.cpp cache (`~/.cache/llama.cpp`, `~/Library/Caches/llama.cpp` on macOS, `%LOCALAPPDATA%\llama.cpp` on Windows). `NODE_LLAMA_CPP_GPU_BACKEND` accepts `auto`, `metal`, `cuda`, `vulkan`, or `cpu`. It also serves embeddings and reports tool support as `true`.

### vLLM

**Env var / settings key:** `VLLM_BASE_URL` (required — no default)  
**API key:** optional via `VLLM_API_KEY`; defaults to `sk-no-key-required`

Start a vLLM server:

```bash
vllm serve meta-llama/Llama-3-8B-Instruct --port 8000
```

Then set the URL:

```bash
export VLLM_BASE_URL=http://127.0.0.1:8000
```

If your vLLM deployment requires an API key:

```bash
export VLLM_API_KEY=your-key
```

`VLLMProvider` extends `OpenAICompatProvider` and reports tool support as `true`.

---

## Provider-level changes (dev path)

You need to edit source only when changing how a provider works, not when adding models.

| Change | File to edit |
|---|---|
| URL resolution or default port | `packages/runtime/src/providers/defaults.ts` and the constructor in the provider file |
| Tool-call handling | `lmstudio-provider.ts` / `llama-provider.ts` / `vllm-provider.ts` |
| Message normalization (all three) | `packages/runtime/src/providers/openai-compat-provider.ts` |
| Registration kwargs (env var name, default value) | `packages/runtime/src/providers/index.ts` registration block |
| Container env propagation | `getContainerEnv()` in the provider class |

These providers do not load from `dist/` (unlike `base-nodes`, `node-sdk`), so no build step is needed — changes take effect on the next `npm run dev`.

---

## Verify

```bash
# 1. Check types and lint
npm run typecheck
npm run lint

# 2. Start the local server (example: llama.cpp on port 8080)
./llama-server --model /path/to/model.gguf --port 8080

# 3. Set the URL and run a single node against it
export LLAMA_CPP_URL=http://127.0.0.1:8080
npm run dev:nodetool -- node run nodetool.agents.Agent \
  --props '{"prompt": "What is 2+2?", "model": {"type": "language_model", "provider": "llama_cpp", "id": "your-model-id"}}' 

# Or use the chat CLI
npm run dev:chat -- --provider llama_cpp --model your-model-id

# 4. Run the repository checks
npm run test:affected
npm run dev:nodetool -- harness gate --base origin/main
```

For LM Studio and vLLM, substitute the provider name (`lmstudio`, `vllm`) and the corresponding env var.

---

## Contributing

PRs are welcome at <https://github.com/nodetool-ai/nodetool>. Before pushing:

```bash
npm run test:affected
npm run typecheck
npm run lint
```

Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
