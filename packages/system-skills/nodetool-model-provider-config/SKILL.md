---
name: nodetool-model-provider-config
description: "Configure NodeTool model providers, credentials, and model selection, including local Ollama and Hugging Face models."
featured: true
---

You help users configure AI model providers and select the right models for their tasks.

# Provider Overview

| Provider | Type | Key Env Var | Models |
|----------|------|-------------|--------|
| **OpenAI** | Cloud | `OPENAI_API_KEY` | GPT-5.4 / GPT-5.4-mini, GPT-Image, TTS, Whisper |
| **Anthropic** | Cloud | `ANTHROPIC_API_KEY` | Claude Sonnet 4.6, Haiku |
| **Gemini (Google)** | Cloud | `GEMINI_API_KEY` | Gemini 2.5, Veo, Nano Banana |
| **xAI** | Cloud | `XAI_API_KEY` | Grok 4 |
| **Ollama** | Local | `OLLAMA_API_URL` | Qwen, Llama 3, Mistral, any GGUF. Separate install, must be running |
| **HuggingFace** | Cloud | `HF_TOKEN` | Hosted Inference Providers |
| **HuggingFace local** (`huggingface-local`) | Local | — | Diffusers/Transformers models via the HuggingFace Python pack |
| **FAL** | Cloud | `FAL_API_KEY` | Fast image/video generation |
| **Replicate** | Cloud | `REPLICATE_API_TOKEN` | Community models |
| **Comfy Cloud** | Cloud | `COMFY_API_KEY` | No model list; runs a ComfyUI workflow on Comfy's GPUs via `lib.comfy.RunWorkflowOnCloud` |
| **vLLM** | Local | `VLLM_BASE_URL` (required) | Self-hosted, OpenAI-compatible |
| **LM Studio** | Local | `LMSTUDIO_API_URL` | Models loaded in LM Studio's local server |
| **llama.cpp server** (`llama_cpp`) | Local | `LLAMA_CPP_URL` (required) | A `llama-server` you run |
| **llama.cpp local** (`node_llama_cpp`) | Local | — | GGUF files in-process; runtime from Package Manager → Software |
| **MLX** | Local | — | MLX Python pack, Apple Silicon only |

Other registered chat providers (any of these is valid for `-p/--provider`):
`groq`, `mistral`, `deepseek`, `moonshot`, `minimax`, `cerebras`, `alibaba`
(`DASHSCOPE_API_KEY`, Qwen via Alibaba Cloud Model Studio), `together`,
`openrouter`, `requesty`, `opper`, `codex`, `claude_agent_sdk`, `lmstudio`. Run `nodetool models
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
nodetool secrets store COMFY_API_KEY

# Via environment variables
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AI...
export HF_TOKEN=hf_...
export FAL_API_KEY=...
export REPLICATE_API_TOKEN=r8_...
export COMFY_API_KEY=comfyui-...
export OLLAMA_API_URL=http://localhost:11434
```

# Model Selection by Task

## whisper.cpp speech recognition

Both providers are local-only and unavailable on the cloud profile.
`whisper_cpp` runs speech recognition in the backend through the optional
`@fugood/whisper.node@1.1.3` runtime package. Install **whisper.cpp** from the
Package Manager, then download a GGML model from Models. It serves
`nodetool.text.AutomaticSpeechRecognition` and `whisper_cpp.LiveTranscription`.
Use the absolute model path returned by discovery unchanged as the ASR model id.

Models use the Hugging Face hub cache (see HuggingFace models below for how its
location resolves). `WHISPER_CPP_MODELS_DIR` adds another directory.
`WHISPER_CPP_GPU_BACKEND` accepts `auto`, `metal`, `cuda`, `vulkan`, or `cpu`.
`auto` uses the default build, including Metal on macOS. Restart the backend
after changing the backend setting. Live transcription accepts base64 PCM16
mono chunks with an optional `content_metadata.sample_rate` and uses Silero
VAD when installed, otherwise fixed windows.

`whisper_cpp_server` calls a user-run `whisper-server`. Set
`WHISPER_CPP_SERVER_URL` to its base URL. The model id is `default`, representing
the model loaded by that server. It requires no native runtime package.

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
| TTS (fast/free) | Kokoro | HuggingFace pack, MLX pack, Transformers.js |
| ASR (accuracy) | Whisper Large V3 | HuggingFace pack, whisper.cpp |
| ASR (fast) | Whisper Turbo | HuggingFace pack, MLX pack, whisper.cpp |

## Embeddings

| Need | Model | Provider |
|------|-------|----------|
| General text | text-embedding-3-small | OpenAI |
| Best quality | text-embedding-3-large | OpenAI |
| Local/free | sentence-transformers | HuggingFace |

# Local Model Setup

## Ollama (Easiest)

Ollama is a separate program. NodeTool does not ship or start it, so it must be
running before its models appear. On macOS and Windows, download it from
ollama.com. On Linux:

```bash
# Install
curl -fsSL https://ollama.com/install.sh | sh

# Pull models
ollama pull llama3
ollama pull mistral
ollama pull qwen2

# Verify
ollama list

# NodeTool finds Ollama at 127.0.0.1:11434
# Override: OLLAMA_API_URL in Settings → Integrations → Local Model Servers,
# or export OLLAMA_API_URL=http://host:11434
```

`OLLAMA_CONTEXT_LENGTH` sets the context window sent with each request.
Unset, NodeTool uses the model's own value, capped at 32768.

## Python packs (HuggingFace local, MLX, Wan2GP)

Local Diffusers/Transformers models, MLX models and Wan2GP video run in the
Python worker, and each needs its pack.

- Desktop app: **Tools → Package Manager → Python packs**. Installing a pack
  sets up Python first if it is missing. The HuggingFace pack pulls a PyTorch
  2.14 build matched to the GPU. MLX is offered only on Apple Silicon Macs.
- Without the desktop app: a Python 3.11+ env with
  `pip install nodetool-core nodetool-huggingface` (plus `nodetool-mlx` on
  Apple Silicon), then start the server with `NODETOOL_PYTHON` pointing at that
  env's `python`.
- `NODETOOL_TORCH_DEVICE` (`cuda`, `cuda:1`, `mps`, `cpu`) picks the device.
- Wan2GP nodes call a Wan2GP server the user runs. `WAN2GP_MCP_URL` (default
  `http://127.0.0.1:7866/mcp`) or the node's `server_url` points at it.

## HuggingFace models

Download local models in the Model Manager before running the workflow. A node
that downloads on first use can fail on a gated repo or stall a run.

For gated models:
1. Accept the license on the model page at huggingface.co
2. Store `HF_TOKEN` in Settings (or `nodetool secrets store HF_TOKEN`). Model
   Manager downloads use it
3. Download the model in the Model Manager

Models go to the Hugging Face hub cache: `HF_HUB_CACHE`, else
`HUGGINGFACE_HUB_CACHE`, else `$HF_HOME/hub`, else
`$XDG_CACHE_HOME/huggingface/hub`, else `~/.cache/huggingface/hub`. Every
reader uses this one order.

## llama.cpp

Two providers. `node_llama_cpp` loads GGUF files in-process after the runtime
is installed from Package Manager → Software. `llama_cpp` calls a
`llama-server` the user runs, at `LLAMA_CPP_URL`. Best for CPU inference and
quantized models.

## whisper.cpp and Transformers.js

whisper.cpp is speech recognition only (see above). Transformers.js runs small
ONNX models in-process after its runtime is installed from Package Manager →
Software. Its cache is `TRANSFORMERS_JS_CACHE_DIR`.

## MLX (Apple Silicon only)

Needs the MLX pack and macOS 14 or newer. Lower memory usage than standard
PyTorch.

# Local Inference Performance

| Framework | Throughput | Memory | Hardware |
|-----------|-----------|--------|----------|
| **llama.cpp** | Medium | Excellent | CPU, GPU |
| **MLX** | Good | Excellent | Apple Silicon |
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
- **Ollama not running**: NodeTool does not start it. Start the Ollama app or `ollama serve`
- **Gated HF models**: Must accept terms on huggingface.co first
- **GPU memory**: Large models need 8-24GB VRAM; use quantized versions. PyTorch 2.14 CUDA builds need a Turing (RTX 20xx) or newer NVIDIA card and driver 580+
- **No local provider in the model menu**: the Python pack is missing, or `NODETOOL_PYTHON_ON_DEMAND=true` and no workflow has started the worker yet
- **Rate limits**: Cloud providers have rate limits; implement retries or use local
- **Model ID mismatch**: Use the exact model ID from the provider (e.g., `gpt-5.4`, `claude-sonnet-4-6`) — `nodetool models by-provider <provider>` lists them
