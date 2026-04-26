---
name: nodetool-model-provider-config
description: Configure AI model providers (OpenAI, Anthropic, Gemini, Ollama, HuggingFace, FAL, Replicate), set up API keys, choose models by task, run local inference with llama.cpp/MLX. Use when user asks about models, providers, API keys, which model to use, or configure any AI provider.
---

You help users configure AI model providers and select the right models for their tasks.

# Provider Overview

| Provider | Type | Key Env Var | Models |
|----------|------|-------------|--------|
| **OpenAI** | Cloud | `OPENAI_API_KEY` | GPT-4o, GPT-3.5, DALL-E, TTS, Whisper |
| **Anthropic** | Cloud | `ANTHROPIC_API_KEY` | Claude 4.6, Claude 4.5, Haiku |
| **Google** | Cloud | `GEMINI_API_KEY` | Gemini 2.0, Veo, Nano Banana |
| **Ollama** | Local | `OLLAMA_API_URL` | Llama 3, Mistral, Qwen, any GGUF |
| **HuggingFace** | Local/Cloud | `HF_TOKEN` | 1000+ models, auto-download |
| **FAL** | Cloud | `FAL_API_KEY` | Fast image/video generation |
| **Replicate** | Cloud | `REPLICATE_API_TOKEN` | Community models |
| **vLLM** | Local | `VLLM_API_URL` | Self-hosted, OpenAI-compatible |
| **llama.cpp** | Local | — | GGUF models, CPU/GPU |
| **MLX** | Local | — | Apple Silicon optimized |

# API Key Setup

```bash
# Via CLI (encrypted storage)
nodetool secrets store OPENAI_API_KEY
nodetool secrets store ANTHROPIC_API_KEY
nodetool secrets store GEMINI_API_KEY
nodetool secrets store HF_TOKEN
nodetool secrets store FAL_API_KEY
nodetool secrets store REPLICATE_API_TOKEN

# Via environment variables
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AI...
export HF_TOKEN=hf_...
export FAL_API_KEY=...
export REPLICATE_API_TOKEN=r8_...
export OLLAMA_API_URL=http://localhost:11434
```

# Model Selection by Task

## Language / Chat

| Need | Model | Provider | Notes |
|------|-------|----------|-------|
| Best quality | GPT-4o, Claude 4.6 | OpenAI, Anthropic | Highest capability |
| Good balance | GPT-4o-mini, Claude Haiku | OpenAI, Anthropic | Fast + cheap |
| Local/private | Llama 3 70B, Qwen 32B | Ollama | No data leaves machine |
| Lightweight local | Llama 3 8B, Mistral 7B | Ollama | Low memory |
| Code | Claude 4.6, GPT-4o | Anthropic, OpenAI | Best for coding |

## Image Generation

| Need | Model | Provider | Notes |
|------|-------|----------|-------|
| Best quality | FLUX.2 Dev | HuggingFace, FAL | State-of-art |
| Fast | FLUX Schnell | HuggingFace | Quick iterations |
| Versatile | SDXL | HuggingFace | Many LoRAs available |
| API-based | DALL-E 3 | OpenAI | No local GPU needed |

## Video Generation

| Need | Model | Provider |
|------|-------|----------|
| Best quality | Sora 2 Pro | OpenAI (KIE) |
| Fast | Wan 2.6 | KIE |
| Image-to-video | Kling 2.6 | KIE |
| Talking avatar | Kling AI Avatar | KIE |

## Speech & Audio

| Need | Model | Provider |
|------|-------|----------|
| TTS (quality) | ElevenLabs | ElevenLabs |
| TTS (fast/free) | Whisper TTS | HuggingFace |
| ASR (accuracy) | Whisper Large V3 | HuggingFace |
| ASR (fast) | Whisper Turbo | HuggingFace |

## Embeddings

| Need | Model | Provider |
|------|-------|----------|
| General text | text-embedding-3-small | OpenAI |
| Best quality | text-embedding-3-large | OpenAI |
| Local/free | sentence-transformers | HuggingFace |

# Local Model Setup

## Ollama (Easiest)

```bash
# Install
curl -fsSL https://ollama.ai/install.sh | sh

# Pull models
ollama pull llama3
ollama pull mistral
ollama pull qwen2

# Verify
ollama list

# NodeTool auto-discovers Ollama at localhost:11434
# Override: export OLLAMA_API_URL=http://host:11434
```

## HuggingFace (Auto-Download)

Models auto-download to `~/.cache/huggingface/` on first use.

For gated models:
1. Accept terms on HuggingFace Hub
2. Set `HF_TOKEN`
3. Model downloads automatically

## llama.cpp

Manual GGUF model loading. Best for CPU inference and quantized models.

## MLX (Apple Silicon only)

Optimized for M1/M2/M3 chips. Lower memory usage than standard PyTorch.

# Local Inference Performance

| Framework | Throughput | Memory | Hardware |
|-----------|-----------|--------|----------|
| **llama.cpp** | Medium | Excellent | CPU, GPU |
| **MLX** | Good | Excellent | Apple Silicon |
| **Nunchaku** | Excellent | Excellent | NVIDIA GPU |
| **Transformers** | Medium | Good | Any |

# Provider-Agnostic Nodes

These nodes work with any provider — just select the model:

| Node | Purpose |
|------|---------|
| `nodetool.agents.Agent` | Any LLM for chat/reasoning |
| `nodetool.image.TextToImage` | Any image generation model |
| `nodetool.image.ImageToImage` | Any image transformation model |
| `nodetool.video.TextToVideo` | Any video generation model |
| `nodetool.video.ImageToVideo` | Any image-to-video model |
| `nodetool.audio.TextToSpeech` | Any TTS model |
| `nodetool.text.AutomaticSpeechRecognition` | Any ASR model |

# Custom Provider Development

```typescript
import { BaseProvider, ProviderId, Message, ProviderStreamItem, LanguageModel } from "@nodetool/core";

export class MyProvider extends BaseProvider {
  constructor(kwargs: Record<string, unknown> = {}) {
    super("my_provider" as ProviderId);
    this.apiKey = kwargs.MY_API_KEY ?? process.env.MY_API_KEY ?? "";
  }

  static requiredSecrets(): string[] {
    return ["MY_API_KEY"];
  }

  async *generateMessages(
    messages: Message[],
    model: string
  ): AsyncIterable<ProviderStreamItem> {
    // Call your API, yield chunks
    yield { type: "chunk", content: "response text" };
  }

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [{ id: "my-model", name: "My Model", provider: "my_provider" }];
  }
}
```

# Provider Capabilities

| Capability | OpenAI | Anthropic | Google | Ollama | HF |
|-----------|--------|-----------|--------|--------|-----|
| Chat/Text | yes | yes | yes | yes | yes |
| Vision | yes | yes | yes | some | yes |
| Image Gen | yes (DALL-E) | no | no | no | yes |
| Video Gen | no | no | yes (Veo) | no | some |
| TTS | yes | no | no | no | yes |
| ASR | yes (Whisper) | no | no | no | yes |
| Embeddings | yes | no | yes | yes | yes |
| Tool Calling | yes | yes | yes | some | no |

# Common Pitfalls

- **Wrong key env var name**: Each provider has a specific name (see table above)
- **Ollama not running**: Start with `ollama serve` before using
- **Gated HF models**: Must accept terms on hub.huggingface.co first
- **GPU memory**: Large models need 8-24GB VRAM; use quantized versions
- **Rate limits**: Cloud providers have rate limits; implement retries or use local
- **Model ID mismatch**: Use exact model ID from provider (e.g., `gpt-4o` not `gpt4o`)
