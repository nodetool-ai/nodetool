---
layout: page
title: "Local Inference (LM Studio, llama.cpp, vLLM): Add Models"
description: "How to run local OpenAI-compatible inference servers with NodeTool — URL config, model discovery, and provider code paths."
---

NodeTool ships three providers that talk to a local OpenAI-compatible HTTP server: **LM Studio**, **llama.cpp** (`llama_cpp`), and **vLLM**. All three follow the same pattern: point NodeTool at the server's base URL, load a model in the server, and the model appears in the UI automatically via a `/v1/models` fetch.

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
| Provider registration block | `packages/runtime/src/providers/index.ts` lines 241–282 |

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

All three are registered in `packages/runtime/src/providers/index.ts` inside a guard that skips production:

```typescript
if (_envProcess.env["NODETOOL_ENV"] !== "production") {
  registerBuiltinProvider(
    PROVIDER_IDS.LMSTUDIO,
    LMStudioProvider,
    {},
    { LMSTUDIO_API_URL: LMSTUDIO_DEFAULT_URL, LMSTUDIO_API_KEY: "lm-studio" }
  );
  registerBuiltinProvider(PROVIDER_IDS.LLAMA_CPP, LlamaProvider, {
    LLAMA_CPP_URL: ""
  });
  registerBuiltinProvider(
    PROVIDER_IDS.VLLM,
    VLLMProvider,
    { VLLM_BASE_URL: "" },
    { VLLM_API_KEY: "sk-no-key-required" }
  );
}
```

The fourth argument is `optionalKwargs` — settings re-resolved from the secret store on every `getProvider()` call without blocking `isProviderConfigured()`. That is why LM Studio works by default (the URL has a fallback); llama.cpp and vLLM are unavailable until their URL is set.

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
npm run dev:chat -- --agent --provider lmstudio --model <model-id>
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

llama.cpp does not reliably support the OpenAI tool-call wire format. `LlamaProvider` sets `hasToolSupport` to `false` and falls back to text-emulated tool calls: after a `stop` finish reason, the provider scans the accumulated text for lines matching `FunctionName(arg=value, ...)` patterns and converts them to `ToolCall` objects. This parsing is in `parseEmulatedToolCalls()` / `parseKeywordArgs()` in `llama-provider.ts`.

Message normalization is also heavier here: system messages are collected and prepended, `tool` role messages are rewritten as `user` messages, and strict user/assistant alternation is enforced by inserting empty filler turns.

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

`VLLMProvider` extends `OpenAIProvider` and reports tool support as `true`.

---

## Provider-level changes (dev path)

You need to edit source only when changing how a provider works, not when adding models.

| Change | File to edit |
|---|---|
| URL resolution or default port | `packages/runtime/src/providers/defaults.ts` and the constructor in the provider file |
| Tool-call handling | `lmstudio-provider.ts` / `llama-provider.ts` / `vllm-provider.ts` |
| Message normalization (llama.cpp) | `normalizeMessagesForLlama()` in `llama-provider.ts` |
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
npm run dev:nodetool -- node run nodetool.text.llm.LlamaAgent \
  --props '{"prompt": "What is 2+2?", "model": {"provider": "llama_cpp", "model": "your-model-id"}}' 

# Or use the chat CLI
npm run dev:chat -- --agent --provider llama_cpp --model your-model-id

# 4. Run all checks
npm run check
```

For LM Studio and vLLM, substitute the provider name (`lmstudio`, `vllm`) and the corresponding env var.

---

## How past commits did it

**`566441b4`** ("refactor: dedupe constants to single canonical definitions") introduced `packages/runtime/src/providers/defaults.ts`, consolidating `LMSTUDIO_DEFAULT_URL` (`http://127.0.0.1:1234`) and `OLLAMA_DEFAULT_URL` from scattered literals across `runtime`, `websocket`, and `cli`. It also wired `LMSTUDIO_API_URL` resolution through the provider constructor so Settings → API Keys changes take effect without a restart. Files changed: `defaults.ts` (new), `lmstudio-provider.ts`, `index.ts`, `websocket/src/models-api.ts`, `websocket/src/openai-api.ts`, `cli/src/providers.ts`.

---

## Contributing

PRs are welcome at <https://github.com/nodetool-ai/nodetool>. Before pushing:

```bash
npm run check   # typecheck + lint + test
```

Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
