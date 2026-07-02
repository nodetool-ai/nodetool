---
layout: page
title: "Connect OpenAI, Anthropic, Gemini & Ollama to NodeTool"
description: "Bring your own keys: connect OpenAI, Anthropic, Gemini, Ollama, and 30+ providers to NodeTool workflows. Local or cloud, swap models without rewiring the graph."
---

A provider is the adapter between a NodeTool node and an AI service — OpenAI, Anthropic, Gemini, a local Ollama daemon, or one of the 30+ others below. Every node that calls an LLM or a media model exposes a `model` property backed by a provider id. Pick a different provider from that same dropdown and the rest of the graph — edges, other nodes — doesn't change.

This is bring-your-own-key (BYOK): NodeTool never marks up a provider's price, and cloud usage is billed directly by the provider. Add a key in **Settings → Providers**, or skip keys entirely and run everything through local models (Ollama, vLLM, LM Studio, llama.cpp).

New to models and providers generally? Start with [Models & Providers](models-and-providers.md) for the local-vs-cloud overview, or [Supported Models](models.md) for the full model catalog. This page is the provider reference: what each one does, which key it needs, and where to read more.

## Capability matrix

Checked against each provider's implementation in `packages/runtime/src/providers/` — a blank cell means that provider doesn't expose the modality through NodeTool's generic nodes, even where the underlying service might.

| Provider | Text | Image | Video | TTS | ASR | Embeddings | 3D |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| Anthropic | ✅ | | | | | | |
| Google Gemini | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| xAI (Grok) | ✅ | ✅ | ✅ | | | | |
| DeepSeek | ✅ | | | | | | |
| Groq | ✅ | | | | | | |
| Mistral | ✅ | | | | | ✅ | |
| Cerebras | ✅ | | | | | | |
| GMI Cloud | ✅ | | | | | | |
| OpenRouter | ✅ | ✅ | | | | | |
| Together AI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| Moonshot (Kimi) | ✅ | | | | | | |
| MiniMax | ✅ | ✅ | ✅ | ✅ | | | |
| Codex (OpenAI OAuth) | ✅ | ✅ | | | | | |
| Claude Agent SDK | ✅ | | | | | | |
| Evolink | ✅ | ✅ | ✅ | | | | |
| kie.ai | ✅¹ | ✅ | ✅ | ✅ | | | |
| AKI | ✅ | ✅ | | | | | |
| Replicate | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| FAL | | ✅ | ✅ | ✅ | | | |
| HuggingFace | ✅ | ✅ | ✅² | ✅ | ✅ | ✅ | |
| Ollama | ✅ | | | | | ✅ | |
| vLLM | ✅ | | | | | | |
| LM Studio | ✅ | | | | | | |
| llama.cpp | ✅ | | | | | | |
| ElevenLabs | | | | ✅ | ✅³ | | |
| Topaz | | ✅⁴ | | | | | |
| Reve | | ✅ | | | | | |
| AtlasCloud | | ✅ | ✅ | | | | |
| Cohere | | | | | | ✅ | |
| Voyage AI | | | | | | ✅ | |
| Jina AI | | | | | | ✅ | |
| Meshy AI | | | | | | | ✅ |
| Rodin AI | | | | | | | ✅ |

¹ Chat only for a short gateway list (GPT-5.5, Claude Opus/Sonnet/Haiku 4.x, Gemini 3.1 Pro) — most kie.ai models are image, video, or audio.
² Text-to-video only; no image-to-video.
³ Via a dedicated Speech-to-Text node, not the generic ASR picker.
⁴ Upscale and enhancement, not text-to-image generation.

### Provider capabilities

NodeTool derives this matrix by checking which optional methods a provider overrides — `getAvailableImageModels` for text-to-image/image-to-image, `getAvailableTTSModels` for text-to-speech, `getAvailableASRModels` for speech recognition, `getAvailableEmbeddingModels` for embeddings, `getAvailable3DModels` for 3D — rather than a hand-maintained flag per provider. To make a model usable outside the node graph (an agent, the `generate` CLI command, the generation API), implement the matching method on the provider; the capability then shows up automatically everywhere NodeTool lists what a provider can do.

## OpenAI

OpenAI covers chat (GPT), image generation (GPT-Image), Sora 2 Pro video, TTS, Whisper transcription, and embeddings — six of the seven modalities in the matrix above. Cloud only, keyed by `OPENAI_API_KEY`. Chat models are fetched live from the OpenAI API; image models are a maintained static list. See the [OpenAI provider guide](developer/providers/openai.md).

## Anthropic

Anthropic runs Claude chat models with tool calling and image input for vision tasks. It doesn't generate images, video, or audio. Cloud only, keyed by `ANTHROPIC_API_KEY`; models are fetched live from the Anthropic API. See the [Anthropic provider guide](developer/providers/anthropic.md).

## Google Gemini

Gemini handles chat with native multimodal input (images, audio, video as Blobs), Nano Banana / Imagen image generation, Veo video, audio transcription, and text embeddings. Cloud only, keyed by `GEMINI_API_KEY`. Text models auto-fetch; Imagen and Veo are static lists. See the [Gemini provider guide](developer/providers/gemini.md).

## xAI (Grok)

xAI runs Grok chat models plus Grok Imagine for text-to-video, image-to-video, and text-to-image, all classified from the same `/v1/models` response. Cloud only, keyed by `XAI_API_KEY`. See the [xAI provider guide](developer/providers/xai.md).

## DeepSeek

DeepSeek is chat only — DeepSeek-V3 and the R1 reasoning line — reached through an OpenAI-compatible endpoint. Cloud only, keyed by `DEEPSEEK_API_KEY`. See the [OpenAI-compatible providers guide](developer/providers/openai-compatible.md) for how its models are fetched.

## Groq

Groq runs chat models on its LPU inference hardware for low-latency responses. Text only — no image, video, or audio generation. Cloud only, keyed by `GROQ_API_KEY`. See the [OpenAI-compatible providers guide](developer/providers/openai-compatible.md).

## Mistral

Mistral runs chat models (Mistral, Mixtral) plus one embedding model, `mistral-embed`. Cloud only, keyed by `MISTRAL_API_KEY`. See the [OpenAI-compatible providers guide](developer/providers/openai-compatible.md).

## Cerebras

Cerebras runs chat models on its high-throughput inference hardware. Text only. Cloud only, keyed by `CEREBRAS_API_KEY`. See the [OpenAI-compatible providers guide](developer/providers/openai-compatible.md).

## GMI Cloud

GMI Cloud is an OpenAI-compatible chat endpoint for open-weight models — Llama, DeepSeek, and Qwen variants. Text only. Cloud only, keyed by `GMI_API_KEY`.

## OpenRouter

OpenRouter proxies 300+ chat models plus image generation through a single key. Cloud only, keyed by `OPENROUTER_API_KEY`. See the [OpenAI-compatible providers guide](developer/providers/openai-compatible.md).

## Together AI

Together AI is one of the broadest providers in NodeTool: chat, manifest-driven image and video generation, TTS (Orpheus, Kokoro, Cartesia Sonic), ASR (Whisper Large v3, Voxtral, Parakeet), and one embedding model. Cloud only, keyed by `TOGETHER_API_KEY`. See the [Together provider guide](developer/providers/together.md).

## Moonshot (Kimi)

Moonshot runs Kimi chat models over an Anthropic-compatible endpoint — it subclasses the Anthropic provider, not OpenAI. Text only. Cloud only, keyed by `KIMI_API_KEY`. See the [OpenAI-compatible providers guide](developer/providers/openai-compatible.md).

## MiniMax

MiniMax covers chat, image (Image-01), video (Hailuo 2.3), TTS, and music generation in one provider. ASR and embeddings exist in MiniMax's API but are disabled in NodeTool's provider (embeddings need a GroupId NodeTool doesn't manage) — use another provider for those. Cloud only, keyed by `MINIMAX_API_KEY`. See the [MiniMax provider guide](developer/providers/minimax.md).

## Codex (OpenAI OAuth)

Codex reaches GPT chat models and GPT-Image 2 generation through your logged-in ChatGPT/Codex OAuth session instead of an API key — usage bills against that subscription. Cloud only, keyed by the stored `CODEX_ACCESS_TOKEN`; no `OPENAI_API_KEY` needed.

## Claude Agent SDK

Claude Agent SDK reaches Claude by spawning your local, logged-in `claude` CLI instead of calling the Anthropic API directly, billing against your Claude subscription rather than per-token API spend. It supports tool calls through an in-process MCP bridge; images in the prompt are not forwarded to the CLI, so vision input doesn't work through this path. No API key — requires the `claude` CLI installed and logged in. See [Claude Agent SDK](AGENTS.md#claude-agent-sdk).

## Evolink

Evolink is an OpenAI/Anthropic-compatible gateway: one key for GPT, Claude, Gemini, and DeepSeek chat, plus image (GPT Image 2, Nano Banana 2, Seedream) and video (Seedance, Wan, Veo, Sora, Grok) generation. Cloud only, keyed by `EVOLINK_API_KEY`.

## kie.ai

kie.ai is a multi-model aggregator: manifest-driven image, video, TTS, and music models (Seedance, Runway, Wan, Kling, FLUX.2, Suno, and more), plus chat for a short list of gateway models (GPT-5.5, Claude Opus/Sonnet/Haiku 4.x, Gemini 3.1 Pro). One key covers all of it, often at a lower price than the upstream provider directly. Cloud only, keyed by `KIE_API_KEY`. See the [KIE provider guide](developer/providers/kie.md).

## AKI

AKI is an OpenAI-compatible gateway for chat plus text-to-image and image-to-image generation. Cloud only, keyed by `AKI_API_KEY`.

## Replicate

Replicate runs chat, image, video, and music, plus curated TTS, ASR, and embedding models. Chat calls `replicate.run()`/`.stream()` on whatever model id you pass, so it isn't limited to a fixed model list the way most other providers are; image, video, and music nodes are generated from Replicate's schemas. Cloud only, keyed by `REPLICATE_API_TOKEN`. See the [Replicate provider guide](developer/providers/replicate.md).

## FAL

FAL generates image, video, TTS, and music from models whose nodes are generated straight from FAL's OpenAPI schemas. No chat. Cloud only, keyed by `FAL_API_KEY`. See the [FAL provider guide](developer/providers/fal.md).

## HuggingFace

HuggingFace exposes chat, image, text-to-video, TTS, ASR, and embeddings backed by Hub model discovery, plus a hand-written node pack for models the generic providers don't cover, including 3D nodes (`HFTextTo3D`, `HFImageTo3D`). Optional `HF_TOKEN` — needed for gated or private models and higher rate limits. See [HuggingFace Integration](huggingface.md).

## Ollama

Ollama runs chat and embedding models locally — no API key, no per-token cost. Pull a model with `ollama pull <model>` and it appears in NodeTool automatically. Configured via `OLLAMA_API_URL` (default `http://127.0.0.1:11434`). See the [Ollama provider guide](developer/providers/ollama.md).

## vLLM

vLLM points NodeTool at a self-hosted, OpenAI-compatible vLLM server for chat — models appear automatically from its `/v1/models` endpoint once the URL is set. Set `VLLM_BASE_URL` (and `VLLM_API_KEY` if your deployment requires one; no default). See [Local Inference](developer/providers/local-inference.md).

## LM Studio

LM Studio connects to the local server LM Studio's desktop app exposes — enable it in LM Studio → Local Server and NodeTool picks up loaded models automatically. Default URL `http://127.0.0.1:1234`, overridden with `LMSTUDIO_API_URL`. See [Local Inference](developer/providers/local-inference.md).

## llama.cpp

llama.cpp points NodeTool at a local `llama-server` instance for chat. The OpenAI tool-call wire format isn't reliably supported, so NodeTool falls back to parsing emulated function-call syntax out of the model's text output. Set `LLAMA_CPP_URL` (required, no default). See [Local Inference](developer/providers/local-inference.md).

## ElevenLabs

ElevenLabs covers text-to-speech, with a large static voice and model catalog, and speech-to-text, plus realtime WebSocket variants of both. Cloud only, keyed by `ELEVENLABS_API_KEY`. See the [ElevenLabs provider guide](developer/providers/elevenlabs.md).

## Topaz

Topaz enhances existing images and video — upscale, sharpen, denoise, restore — rather than generating from a prompt. Only the enhance and enhance-gen endpoints appear in the generic image-model picker; the rest (sharpen, denoise, lighting, matting, restore) are dedicated nodes. Cloud only, keyed by `TOPAZ_API_KEY`. See the [Topaz provider guide](developer/providers/topaz.md).

## Reve

Reve creates, edits, and remixes images through three dedicated nodes (`CreateImage`, `EditImage`, `RemixImage`); the runtime provider also exposes create and edit to the generic image picker. Cloud only, keyed by `REVE_API_KEY`. See the [Reve provider guide](developer/providers/reve.md).

## AtlasCloud

AtlasCloud generates image and video from a hand-maintained manifest (Seedance, GPT Image 2, Nano Banana, and more). No chat. Cloud only, keyed by `ATLASCLOUD_API_KEY`. See the [AtlasCloud provider guide](developer/providers/atlascloud.md).

## Cohere

Cohere provides text embeddings — `embed-v4.0` and the English/multilingual v3 line. No chat and no reranking in NodeTool's current provider. Cloud only, keyed by `COHERE_API_KEY`.

## Voyage AI

Voyage AI provides text embeddings only. Cloud only, keyed by `VOYAGE_API_KEY`.

## Jina AI

Jina AI provides text embeddings only. Cloud only, keyed by `JINA_API_KEY`.

## Meshy AI

Meshy generates textured 3D meshes from text or a reference image, through the generic `nodetool.3d.TextTo3D` / `ImageTo3D` nodes. Cloud only, keyed by `MESHY_API_KEY`.

## Rodin AI

Rodin generates 3D assets from text or a reference image, through the generic `nodetool.3d.TextTo3D` / `ImageTo3D` nodes. Cloud only, keyed by `RODIN_API_KEY`.

## Generic nodes: provider-agnostic workflows

Nodes in the `nodetool.*` namespace take a `model` property and route to whichever provider owns that model — this is what makes switching providers a dropdown change, not a rewiring job.

| Node | Switches between |
|---|---|
| `nodetool.agents.Agent` | OpenAI, Anthropic, Gemini, xAI, DeepSeek, Ollama, any chat provider |
| `nodetool.image.TextToImage` | FLUX.2, Nano Banana 2.0, GPT Image 2, Ideogram V3, Z-Image, HuggingFace, ComfyUI, MLX |
| `nodetool.image.ImageToImage` | HuggingFace, local servers, cloud services |
| `nodetool.video.TextToVideo` | Sora 2 Pro, Veo 3.1, Seedance 2.0, Runway, Grok Imagine, Wan 2.6, Hailuo 2.3, Kling 3.0, HuggingFace |
| `nodetool.video.ImageToVideo` | Sora 2 Pro, Veo 3.1, Seedance 2.0, Runway, Luma, Grok Imagine, Wan 2.6, Hailuo 2.3, Kling 3.0 |
| `nodetool.3d.TextTo3D` / `ImageTo3D` | Meshy AI, Rodin AI, plus HuggingFace 3D nodes (Hunyuan3D, Trellis, TripoSR, Shap-E, Point-E) |
| `nodetool.audio.TextToSpeech` | OpenAI TTS, ElevenLabs, HuggingFace, local TTS |
| `nodetool.text.AutomaticSpeechRecognition` | OpenAI Whisper, HuggingFace, local ASR |

A generic node drops parameters the selected provider doesn't support instead of erroring — negative prompt, guidance scale, and seed apply mostly to HuggingFace/diffusion-style backends; GPT-Image and similar API-only models ignore them.

Reach for a provider-specific node only when you need something the generic interface doesn't carry: Claude's thinking mode, OpenAI's vision detail parameter, MiniMax's emotion and pitch controls.

## Getting keys in

The in-app Settings dialog is the easiest way to add a key: open **Settings → Providers** and paste it in. NodeTool stores it encrypted (AES-256-GCM) in a local SQLite database, not in a plaintext config file — see [Configuration](configuration.md#secret-storage-and-master-key) for how the encryption key itself is managed.

From the CLI:

```bash
nodetool secrets store OPENAI_API_KEY   # prompts for the value, stores it encrypted
nodetool secrets list                   # list stored keys (values are never shown)
nodetool secrets get OPENAI_API_KEY     # print a stored value
```

Or set the variable directly in `.env.development.local` (or your shell environment) — environment variables always take precedence over stored secrets. See [Configuration](configuration.md) for the full load order.

Local providers (Ollama, vLLM, LM Studio, llama.cpp) don't need a key — point NodeTool at the server's URL instead, either in Settings → Providers or via the matching `*_URL` environment variable.

## Adding a new provider

Every provider is a class in `packages/runtime/src/providers/` extending `BaseProvider` (or `OpenAIProvider` / `AnthropicProvider` for OpenAI- or Anthropic-compatible APIs), registered in `provider-registry.ts` with the environment variables it needs. The right approach differs by provider — live model discovery, a hand-maintained manifest, or codegen from upstream schemas — so follow the [Provider Guides](developer/providers/index.md) runbook for your case rather than reverse-engineering it from an existing provider. Run `npm run check` (typecheck, lint, test) before opening a PR.

## See also

- [Models & Providers](models-and-providers.md) — local vs. cloud, mixed workflows, getting started
- [Supported Models](models.md) — the full model catalog and local inference engines
- [Installation](installation.md) — install NodeTool on Windows, macOS, Linux
- [Comparisons](comparisons.md) — NodeTool vs. ComfyUI, n8n, Dify, Flowise, Langflow, Weavy
- [Chat API](chat-api.md) — WebSocket API for chat interactions and provider routing
- [Global Chat](global-chat.md) and [Agent Mode](global-chat.md#agent-mode) — using providers interactively and through the planning agent
- [Workflow API](workflow-api.md) — building workflows with providers
- [Provider Guides](developer/providers/index.md) — runbooks for adding models and nodes to each provider
