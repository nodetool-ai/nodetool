---
layout: page
title: "Provider Guides: Add Models & Nodes"
description: "Per-provider runbooks for adding new models and nodes to NodeTool — written for coding agents and contributors."
---

One runbook per provider for adding models and nodes. Each guide names the files, the command to run, and a snippet. Find the provider's mechanism below first: it decides whether a new model needs zero code, a manifest entry, or a codegen run.

## How adding a model works, by mechanism

| Mechanism | What "add a model" means | Providers |
| :-------- | :----------------------- | :-------- |
| **Dynamic fetch** | Nothing — models appear from the provider's live `/models` (or local daemon) endpoint. Code only for capability/cost overrides. | [OpenAI](openai.md) (chat), [Anthropic](anthropic.md), [Gemini](gemini.md) (text), [xAI](xai.md), [OpenAI-compatible](openai-compatible.md) (Groq, Mistral, DeepSeek, Moonshot, Cerebras, Alibaba Cloud, OpenRouter, Requesty), [Ollama](ollama.md), [Local inference](local-inference.md) (LM Studio, llama.cpp, vLLM, in-process llama.cpp) |
| **Static model list** | A code edit to a hardcoded array in the provider (plus cost entry). | [OpenAI](openai.md) (image), [Gemini](gemini.md) (image, Veo, Omni, Lyria, TTS, ASR, embeddings) |
| **Codegen from upstream schemas** | Add an endpoint id to a config, run the generator — the manifest is regenerated, never hand-edited. | [FAL](fal.md), [Replicate](replicate.md), [KIE](kie.md) |
| **Manifest** | Add a JSON entry to the package manifest. AtlasCloud adds a sync script for fields and Together generates its manifest from a script. | [AtlasCloud](atlascloud.md), [Topaz](topaz.md), [Together](together.md) |
| **Static node package** | Add a model id to the provider/base arrays, or a new `BaseNode` subclass. | [MiniMax](minimax.md), [Reve](reve.md), [ElevenLabs](elevenlabs.md), [HuggingFace](huggingface.md) |

## All guides

- **[OpenAI](openai.md)** — chat models auto-fetch; image models (`gpt-image-*`) are a static list.
- **[Anthropic (Claude)](anthropic.md)** — models fetched live from the Anthropic API.
- **[Google Gemini](gemini.md)** — text auto-fetches; image, Veo, Omni, and Lyria models are static lists.
- **[xAI (Grok)](xai.md)** — a static catalog plus chat, image, and video rows classified from `/v1/models`.
- **[OpenAI-compatible providers](openai-compatible.md)** — Groq, Mistral, DeepSeek, Moonshot, Cerebras, Alibaba Cloud, Cohere, OpenRouter, Requesty, Opper, API Route, Cheaper Inference, Runcrate, Standard Compute, UberLLM, and how to add a new one.
- **[FAL](fal.md)** — nodes generated from FAL OpenAPI schemas via codegen.
- **[Replicate](replicate.md)** — nodes generated from Replicate model schemas via codegen.
- **[KIE](kie.md)** — configs and manifest generated from KIE's published API docs.
- **[AtlasCloud](atlascloud.md)** — hand-maintained manifest drives nodes and the model picker.
- **[Topaz](topaz.md)** — manifest-driven image/video enhancement nodes.
- **[Together AI](together.md)** — generated image/video manifest plus live-fetched chat models.
- **[MiniMax](minimax.md)** — chat, image, video, and audio via provider arrays and a node pack.
- **[Reve](reve.md)** — image create/edit/remix nodes.
- **[ElevenLabs](elevenlabs.md)** — TTS models and voices as static arrays (decorator package).
- **[HuggingFace](huggingface.md)** — Hub-backed model discovery plus a hand-written node pack.
- **[Ollama](ollama.md)** — local models discovered from the running daemon (`ollama pull`).
- **[Local inference](local-inference.md)** — LM Studio, llama.cpp, and vLLM over OpenAI-compatible localhost, plus in-process llama.cpp.

## Provider capabilities

Each provider lists the operations it implements by overriding `BaseProvider.declaredCapabilities()` in `packages/runtime/src/providers/base-provider.ts`. `getCapabilities()` always adds the two chat methods, so providers with no chat models (Meshy, Rodin, Higgsfield) throw when asked to chat. Some providers declare more than the user-facing [capability tables](../../providers.md#capability-matrix) show. Video-to-video, lip sync, upscaling, and music are examples. They surface through agent tools and dedicated nodes, not the generic pickers.

To make a model usable outside the node graph (an agent, the `generate` CLI command, the generation API), implement the matching method on the provider and declare its capability. The contract test `packages/runtime/tests/providers/provider-capabilities-contract.test.ts` fails when a declared capability has no implementation or a model in the provider's catalog offers an undeclared task. KIE chat is a fixed gateway list, `KIE_CHAT_MODELS` in `kie-provider.ts`.

## Cloud account configuration

These settings apply to self-hosted servers and to cloud accounts that need more than one key. The [Providers page](../../providers.md) names only the secret each provider needs.

### Azure OpenAI

Secrets: `AZURE_OPENAI_API_KEY` and `AZURE_OPENAI_ENDPOINT` (for example `https://<resource>.openai.azure.com`, with or without a trailing `/openai`). Requests use OpenAI's wire format, so each call behaves like the OpenAI provider with the deployment name as the model.

Azure does not report what a deployment serves, so the models are the names in `AZURE_OPENAI_DEPLOYMENTS`, separated by commas.

- A name containing `image` or `dall-e` is an image model, `tts` a speech model, `whisper` or `transcribe` a transcription model, and `embedding` an embedding model. Any other name is a chat model.
- Add `:chat`, `:image`, `:tts`, `:asr`, or `:embedding` to a name to set its kind, for example `my-painter:image`.
- For custom deployment names, append `=underlying-model`, for example `speech-prod=gpt-4o-mini-tts` or `transcription-prod=whisper-1`. The underlying model controls media capabilities, including speech instructions and word timestamps, while requests still route to the deployment name. An explicit kind may precede the mapping, such as `speech-prod:tts=gpt-4o-mini-tts`.
- Without `AZURE_OPENAI_API_VERSION` the provider calls the v1 API at `<endpoint>/openai/v1`. A dated version such as `2025-04-01-preview` switches to the `/openai/deployments/<name>` routes.
- Under the cloud profile the endpoint must be a public https host.
- A deployment named after its model, such as `gpt-5.5`, is priced from the Azure rates in `@pydantic/genai-prices`.

### Amazon Bedrock

Secrets: an IAM access key in `BEDROCK_ACCESS_KEY_ID` and `BEDROCK_SECRET_ACCESS_KEY`, with `BEDROCK_SESSION_TOKEN` for temporary credentials. The keys are separate from the `AWS_*` variables so an S3 storage key is never used for Bedrock.

- Chat runs through the Converse API, which covers every Bedrock chat model. Image generation runs Amazon Nova Canvas, Titan Image, and Stability models.
- `BEDROCK_REGION` picks the region (default `us-east-1`). Models are listed from that region: on-demand foundation models plus the system-defined cross-region inference profiles such as `eu.anthropic.claude-sonnet-4-6`, which Claude needs in most regions.
- The IAM user needs `bedrock:ListFoundationModels`, `bedrock:ListInferenceProfiles`, `bedrock:InvokeModel`, and `bedrock:InvokeModelWithResponseStream`.
- `BEDROCK_MODEL_IDS`, a comma-separated list of model or inference profile IDs, offers only those and skips the listing calls.
- Costs are priced from the AWS rates in `@pydantic/genai-prices`.

### Gemini (Google Cloud)

The `gemini_vertex` provider runs the Gemini models through Vertex AI. `GOOGLE_CLOUD_PROJECT` is required, and the project needs billing and the Vertex AI API enabled. `GOOGLE_CLOUD_LOCATION` defaults to `global`, the only location that serves preview models. Set `us`, `eu`, or a region such as `us-central1` to keep requests in one place.

The provider uses the first credential it finds:

1. `GOOGLE_VERTEX_CREDENTIALS`, a service account key file pasted as JSON. The service account needs the Vertex AI User role.
2. `GOOGLE_VERTEX_API_KEY`, a Vertex AI API key from express mode, or a Google Cloud API key bound to a service account. Key requests use the project-less publisher paths.
3. On a local or self-hosted install, the machine's Application Default Credentials: the file in `GOOGLE_APPLICATION_CREDENTIALS`, or the one `gcloud auth application-default login` writes. The cloud profile never reads these, because they would be the server's own identity.

Chat models are listed from Vertex's `publishers/google/models`. The image, video, TTS, and music lists are the Gemini provider's. Vertex has no Files API, so video or audio larger than 19 MB cannot be sent. The `vertex` node namespace (shown as **Vertex AI**) has the same nodes as `gemini`, sent through this provider.

### Regional endpoints

Several providers issue keys that work in one region only.

| Provider | Setting | Notes |
|---|---|---|
| Alibaba Cloud | `DASHSCOPE_REGION=china`, or `DASHSCOPE_BASE_URL` | Default `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` (Singapore). `china` uses `https://dashscope.aliyuncs.com/compatible-mode/v1`. `DASHSCOPE_BASE_URL` wins when both are set. Media uses the same host with `/api/v1`. |
| BytePlus | `BYTEPLUS_ARK_BASE_URL` | Default `https://ark.ap-southeast.bytepluses.com/api/v3`. Set it to your region's `/api/v3` endpoint. |
| Moonshot (Kimi) | `KIMI_REGION=china` | Uses `https://api.moonshot.cn/v1` instead of `https://api.moonshot.ai/v1`. |
| Z.ai | `ZAI_REGION=china` | Uses `https://open.bigmodel.cn/api/paas/v4` instead of `https://api.z.ai/api/paas/v4`. |
| MiniMax | `MINIMAX_REGION=china` | Moves every request to `https://api.minimax.cn`. `MINIMAX_IMAGE_REGION` overrides the host for H3 image requests. |
| Kling AI | `KLING_REGION=china` | Uses `api-beijing.klingai.com` instead of `api-singapore.klingai.com`. Saving a key checks it, and a key the configured host rejects is tried on the other host. |

### Provider details for contributors

- **Alibaba Cloud media:** Wan video tasks are polled every 15 seconds. Media models are a hand-kept list because Model Studio has no listing endpoint that says which models generate media. Tool calling is gated per model family.
- **BytePlus:** the chat picker reads `GET /models` and falls back to a short built-in list of Seed models when the listing fails.
- **Gateways:** Requesty, Opper, Cheaper Inference, API Route, Runcrate, Standard Compute, and UberLLM each read `/v1/models` and keep chat rows through the shared model classifier. See the [OpenAI-compatible providers guide](openai-compatible.md).
- **Kling AI and ToAPIs:** neither has a cancel endpoint, so a stopped run stops waiting but the task still finishes and is billed. Kling's model list is a static array in `kling-provider.ts`.
- **HuggingFace:** model lists are the most-liked models per task, fetched from the Hub and cached for 10 minutes.
- **Antigravity:** each turn spawns `agy` in an empty scratch directory. Turns that offer NodeTool tools run on `agy acp`, with the tools served as an MCP server on a loopback port under a per-turn bearer token. Shell commands stay blocked because `--dangerously-skip-permissions` is never passed.
- **GitHub Copilot:** the CLI runs over `copilot --acp` with `--deny-tool` rules for its shell, file, URL and memory tools. NodeTool's tools are served as an HTTP MCP server on a loopback port.
- **llama.cpp local:** the downloadable GGUF list is a curated list in `node-llama-cpp-models.ts` plus `node-llama-cpp-trending.generated.ts`. A nightly workflow (`.github/workflows/gguf-trending-sync.yml`) runs `npm run sync:gguf-trending` and opens a PR when the trending list changes. It keeps chat models from the trusted publishers in `scripts/gguf/sources.json`, skips uncensored and merged variants, picks one Q4 file of 20 GB or less per repo, and keeps up to 50 models.
- **stable-diffusion.cpp:** the catalog is `packages/runtime/src/providers/sdcpp-models.ts`. The provider reads a checkpoint's architecture from its tensor names and picks default steps, guidance and size. The model id of a folder checkpoint is the file's absolute path.
- **whisper.cpp:** runs through the optional `@fugood/whisper.node` package. `WHISPER_CPP_MODELS_DIR` adds a model directory and `WHISPER_CPP_GPU_BACKEND` selects `auto`, `metal`, `cuda`, `vulkan`, or `cpu`. `whisper_cpp.LiveTranscription` uses Silero VAD or fixed windows. The `whisper_cpp_server` provider posts audio to a `whisper-server` at `WHISPER_CPP_SERVER_URL`.
- **Local servers:** `VLLM_BASE_URL`, `LLAMA_CPP_URL` and `LMSTUDIO_API_URL` have no defaults except LM Studio's `http://127.0.0.1:1234`. `NODE_LLAMA_CPP_GPU_BACKEND` and `NODE_LLAMA_CPP_MODELS_DIR` configure llama.cpp local. `SD_CPP_SERVER_PATH` selects another `sd-server`. `WAN2GP_MCP_URL` names a Wan2GP server you run. `TRANSFORMERS_JS_CACHE_DIR` and `HF_ENDPOINT` control Transformers.js downloads.
- **Python worker providers:** with `NODETOOL_PYTHON_ON_DEMAND=true` they appear only after a workflow has started the worker. The worker's `huggingface` provider is registered as `huggingface-local`.

### Credit balance endpoints

The provider card in **Settings → Models & Providers** shows remaining credit for providers whose API reports it to the key NodeTool already holds. The code is `packages/runtime/src/providers/provider-credits.ts`. Balance reads are cached for 10 minutes per key, and a payment failure marks a key out of credit for 15 minutes.

| Provider | Endpoint read | What it reports |
|---|---|---|
| OpenRouter | `GET /api/v1/key` | The key's spending cap left (`limit_remaining`). A key with no cap reports nothing, because the account balance needs a management key. |
| DeepSeek | `GET /user/balance` | Account balance and `is_available`. |
| Moonshot (Kimi) | `GET /v1/users/me/balance` on the `KIMI_REGION` host | `available_balance`, in USD on api.moonshot.ai and CNY on api.moonshot.cn. |
| kie.ai | `GET /api/v1/chat/credit` | Credits left. |
| FAL | `GET api.fal.ai/v1/account/billing?expand=credits` | Balance, only for a key with the `billing:usage:read` permission. |
| ElevenLabs | `GET /v1/user/subscription` | Credits left this period. Usage-based accounts are never marked out of credit. |
| Meshy AI | `GET /openapi/v1/balance` | Credits left. |
| Topaz | `GET /account/v1/credits/balance` | Available credits. |
| AtlasCloud | `GET /public/v1/balance` | Available balance. |
| Evolink | `GET /v1/credits` | The smaller of the key's and the account's remaining credits. |
| Comfy Cloud | `GET cloud.comfy.org/api/billing/usage/timeseries` | `summary.balance`, in cents. |

### Failure classification

`classifyProviderFailure` in `packages/protocol/src/provider-failure.ts` maps provider errors to kinds (`auth`, `quota`, `rate_limit`, `payment`, `not_found`), shared by the server and the web app. Key checks and failure reports live in `provider-call-failure.ts`, `credential-check.ts` and `replicate-retry.ts` in `packages/runtime/src/providers/`. A failed provider call produces a `provider_call_failed` message with provider, model, operation, kind, status, and message.

## Adding a new provider

Every provider is a class in `packages/runtime/src/providers/` extending `BaseProvider` (or `OpenAIProvider` / `AnthropicProvider` for OpenAI- or Anthropic-compatible APIs), registered in `provider-registry.ts` with the environment variables it needs. Follow the guide for the closest mechanism above.

## Before you open a PR

Whatever the mechanism, run these from the repo root:

```bash
npm run test:affected
npm run typecheck
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

For decorator/codegen packages (FAL, Replicate, KIE, ElevenLabs, and other `dist/`-loaded packs), run `npm run build:packages` after regenerating so the runtime picks up the change. Each guide lists its exact verify commands. `npm run check` is the full aggregate and runs only when explicitly needed.
