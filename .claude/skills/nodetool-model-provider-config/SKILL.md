---
name: nodetool-model-provider-config
description: Configure AI model providers (OpenAI, Anthropic, Gemini, Ollama, HuggingFace, FAL, Replicate), set up API keys, choose models by task, run local inference with llama.cpp/MLX. Use when user asks about models, providers, API keys, which model to use, or configure any AI provider.
---

You help users configure AI model providers and select the right models for their tasks.

# Provider Overview

| Provider | Type | Key Env Var | Models |
|----------|------|-------------|--------|
| **OpenAI** | Cloud | `OPENAI_API_KEY` | GPT-5.4 / GPT-5.4-mini, GPT-Image, TTS, Whisper |
| **Anthropic** | Cloud | `ANTHROPIC_API_KEY` | Claude Sonnet 4.6, Haiku |
| **Gemini (Google)** | Cloud | `GEMINI_API_KEY` | Gemini 2.5, Veo, Nano Banana |
| **xAI** | Cloud | `XAI_API_KEY` | Grok 4 |
| **Ollama** | Local | `OLLAMA_API_URL` | Qwen, Llama 3, Mistral, any GGUF |
| **HuggingFace** | Local/Cloud | `HF_TOKEN` | 1000+ models, auto-download |
| **FAL** | Cloud | `FAL_API_KEY` | Fast image/video generation |
| **Replicate** | Cloud | `REPLICATE_API_TOKEN` | Community models |
| **vLLM** | Local | `VLLM_API_URL` | Self-hosted, OpenAI-compatible |
| **llama.cpp** | Local | — | GGUF models, CPU/GPU |
| **MLX** | Local | — | Apple Silicon optimized |

Other registered chat providers (any of these is valid for `-p/--provider`):
`groq`, `mistral`, `deepseek`, `moonshot`, `minimax`, `cerebras`, `together`,
`openrouter`, `codex`, `claude_agent_sdk`, `lmstudio`. Run `nodetool models
providers` to see configured providers and `nodetool models recommended` for the
curated model list.

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
| Best quality | gpt-5.4, claude-sonnet-4-6 | OpenAI, Anthropic | Highest capability |
| Good balance | gpt-5.4-mini, gemini-2.5-flash | OpenAI, Gemini | Fast + cheap |
| Local/private | Llama 3.3 70B, Qwen 3.5 | Ollama | No data leaves machine |
| Lightweight local | Llama 3 8B, Mistral 7B | Ollama | Low memory |
| Code | claude-sonnet-4-6, gpt-5.4 | Anthropic, OpenAI | Best for coding |

## Image Generation

| Need | Model | Provider | Notes |
|------|-------|----------|-------|
| Best quality | FLUX.2 Dev | HuggingFace, FAL | State-of-art |
| Fast | FLUX Schnell | HuggingFace | Quick iterations |
| Versatile | SDXL | HuggingFace | Many LoRAs available |
| API-based | GPT Image 2, Nano Banana | OpenAI, Gemini/KIE | No local GPU needed |

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

Providers extend `BaseProvider` from `@nodetool-ai/runtime` (not `@nodetool-ai/core`).
Both `generateMessage` and `generateMessages` take a single **args object**.

```typescript
import {
  BaseProvider,
  type ProviderId,
  type Message,
  type ProviderStreamItem,
  type ProviderTool,
  type LanguageModel,
} from "@nodetool-ai/runtime";

export class MyProvider extends BaseProvider {
  private apiKey: string;

  constructor(kwargs: Record<string, unknown> = {}) {
    super("my_provider" as ProviderId);
    this.apiKey = String(kwargs["MY_API_KEY"] ?? process.env.MY_API_KEY ?? "");
  }

  static override requiredSecrets(): string[] {
    return ["MY_API_KEY"];
  }

  // Non-streaming: return a single assistant Message.
  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
  }): Promise<Message> {
    // Call your API with args.messages / args.model …
    return { role: "assistant", content: "response text" };
  }

  // Streaming: yield ProviderStreamItem chunks.
  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
  }): AsyncGenerator<ProviderStreamItem> {
    yield { type: "chunk", content: "response text", done: false };
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [{ id: "my-model", name: "My Model", provider: "my_provider" }];
  }
}
```

Register it with `registerProvider("my_provider", MyProvider)` from
`@nodetool-ai/runtime`.

# Provider Capabilities

| Capability | OpenAI | Anthropic | Google | Ollama | HF |
|-----------|--------|-----------|--------|--------|-----|
| Chat/Text | yes | yes | yes | yes | yes |
| Vision | yes | yes | yes | some | yes |
| Image Gen | yes (GPT-Image) | no | no | no | yes |
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
- **Model ID mismatch**: Use the exact model ID from the provider (e.g., `gpt-5.4`, `claude-sonnet-4-6`) — `nodetool models by-provider <provider>` lists them
