---
layout: page
title: "Providers"
---

The NodeTool provider system offers a unified interface for interacting with various AI service providers. This
abstraction allows you to switch between different AI backends (OpenAI, Anthropic, Gemini, HuggingFace, etc.)
without changing your workflow logic.

## Overview

Providers in NodeTool act as adapters that translate between NodeTool's internal formats and the specific API
requirements of different AI services. The system supports multiple modalities:

- **Language Models (LLMs)** - Text generation and chat completions
- **Image Generation** - Text-to-image and image-to-image creation
- **Video Generation** - Text-to-video and image-to-video synthesis
- **Text-to-Speech (TTS)** - Convert text to natural speech audio
- **Automatic Speech Recognition (ASR)** - Transcribe audio to text
- **3D Generation** - Text-to-3D and image-to-3D model creation

To select a provider, pick a model in the node property panel. Providers are grouped under model families: OpenAI,
Anthropic, Gemini, Hugging Face, Ollama, vLLM.

## Architecture

### Provider Capabilities

The capability system uses introspection to automatically detect which features a provider supports:

| Capability                     | Description                  | Method                           |
| ------------------------------ | ---------------------------- | -------------------------------- |
| `GENERATE_MESSAGE`             | Single message generation    | `generate_message()`             |
| `GENERATE_MESSAGES`            | Streaming message generation | `generate_messages()`            |
| `TEXT_TO_IMAGE`                | Generate images from text    | `text_to_image()`                |
| `IMAGE_TO_IMAGE`               | Transform images with text   | `image_to_image()`               |
| `TEXT_TO_VIDEO`                | Generate videos from text    | `text_to_video()`                |
| `IMAGE_TO_VIDEO`               | Animate images into videos   | `image_to_video()`               |
| `TEXT_TO_SPEECH`               | Convert text to speech       | `text_to_speech()`               |
| `AUTOMATIC_SPEECH_RECOGNITION` | Transcribe audio to text     | `automatic_speech_recognition()` |

## Available Providers

### Language Model Providers

| Provider | File | Streaming | Tool calls | Vision | Notes |
|----------|------|-----------|------------|--------|-------|
| OpenAI | `openai-provider.ts` | ✅ | ✅ | ✅ | Includes DALL-E, TTS, Whisper |
| Anthropic | `anthropic-provider.ts` | ✅ | ✅ | ✅ | JSON via tool use |
| Google Gemini | `gemini-provider.ts` | ✅ | ✅ | ✅ | File input via Blobs, Veo video |
| Ollama | `ollama-provider.ts` | ✅ | model-dependent | Base64 | Local, no API key. `ollama pull` first |
| vLLM | `vllm-provider.ts` | ✅ | model-dependent | ✅ | OpenAI-compatible, self-hosted |
| HuggingFace | `huggingface-provider.ts` | ✅ | — | — | Hub models via FAL/Together/Replicate. See [HuggingFace Integration](huggingface.md) |
| Groq | `groq-provider.ts` | ✅ | ✅ | — | Ultra-fast inference via Groq LPU |
| Mistral | `mistral-provider.ts` | ✅ | ✅ | — | Mistral & Mixtral models |
| Cerebras | `cerebras-provider.ts` | ✅ | ✅ | — | High-throughput Cerebras inference |
| OpenRouter | `openrouter-provider.ts` | ✅ | ✅ | model-dependent | 300+ models via one key. Includes image generation |
| LM Studio | `lmstudio-provider.ts` | ✅ | model-dependent | model-dependent | Local LM Studio server (no API key needed) |
| Together AI | `together-provider.ts` | ✅ | ✅ | — | Open-weight model hosting |
| Moonshot (Kimi) | `moonshot-provider.ts` | ✅ | ✅ | — | Kimi coding plan — Anthropic-compatible endpoint |

### Video Generation Providers

Text-to-video and image-to-video providers available through the unified interface.

| Provider | Capabilities | API Key |
|----------|--------------|---------|
| OpenAI Sora 2 Pro | T2V, I2V | `OPENAI_API_KEY` |
| Google Veo 3.1 (Gemini) | T2V, I2V, multi-image reference | `GEMINI_API_KEY` |
| MiniMax Hailuo 2.3 | T2V, I2V | `MINIMAX_API_KEY` |
| xAI Grok Imagine | T2V, I2V, T2I | via kie.ai |
| Alibaba Wan 2.6 | T2V, I2V, multi-shot | via kie.ai |
| Kling 2.6 | T2V, I2V with audio | via kie.ai |

### Image Generation Providers

| Provider | Access |
|----------|--------|
| Black Forest Labs FLUX.2 | via HuggingFace or direct API |
| Google Nano Banana Pro | `GEMINI_API_KEY` or via kie.ai |
| OpenAI DALL-E 2/3 | `OPENAI_API_KEY` |

### 3D Generation Providers

| Provider | Capabilities | API Key |
|----------|--------------|---------|
| Hunyuan3D V2/3.0 | T2-3D, I2-3D | `HUNYUAN3D_API_KEY` |
| Trellis 2 | T2-3D, I2-3D | `TRELLIS_API_KEY` |
| TripoSR | I2-3D | `TRIPO_API_KEY` |
| Shap-E | T2-3D, I2-3D | `SHAP_E_API_KEY` |
| Point-E | T2-3D | `POINT_E_API_KEY` |
| Meshy AI | T2-3D, I2-3D | `MESHY_API_KEY` |
| Rodin AI | T2-3D, I2-3D | `RODIN_API_KEY` |

Use the HuggingFace 3D nodes (`HFTextTo3D`, `HFImageTo3D`) or the generic nodes (`nodetool.3d.TextTo3D`, `nodetool.3d.ImageTo3D`) to switch providers.

### Multi-Provider Aggregators

**kie.ai** — `KIE_API_KEY`. Unified access to multiple models via a single API. Recommended for providers without direct NodeTool API key support (xAI Grok Imagine, Alibaba Wan 2.6, Kling 2.6, FLUX.2, Nano Banana Pro).

## Generic Nodes: Provider-Agnostic Workflows

Generic nodes in the `nodetool.*` namespace accept a `model` parameter and route to the matching provider. Use these to switch providers without rewiring the graph.

| Node | Switch between |
|------|---------------|
| `nodetool.agents.Agent` | OpenAI, Anthropic, Gemini, Ollama, any LLM |
| `nodetool.image.TextToImage` | FLUX.2, Nano Banana Pro, DALL-E, HuggingFace, ComfyUI, MLX |
| `nodetool.image.ImageToImage` | HuggingFace, local servers, cloud services |
| `nodetool.video.TextToVideo` | Sora 2 Pro, Veo 3.1, Grok Imagine, Wan 2.6, Hailuo 2.3, Kling 2.6, HuggingFace |
| `nodetool.video.ImageToVideo` | Sora 2 Pro, Veo 3.1, Grok Imagine, Wan 2.6, Hailuo 2.3, Kling 2.6, Stability AI |
| `nodetool.3d.TextTo3D` | Hunyuan3D, Trellis 2, Meshy AI, Rodin AI, Shap-E, Point-E |
| `nodetool.3d.ImageTo3D` | Hunyuan3D, Trellis 2, TripoSR, Meshy AI, Rodin AI, Shap-E |
| `nodetool.audio.TextToSpeech` | OpenAI TTS, ElevenLabs, local TTS |
| `nodetool.text.AutomaticSpeechRecognition` | OpenAI Whisper, HuggingFace, local ASR |

Select the node, open the `model` dropdown in the properties panel, and pick any available model. The node routes automatically.
   - Fall back to different providers if one is unavailable
   - Optimize costs by mixing providers in one workflow

### Provider Parameter Mapping

Generic nodes map parameters to provider-specific formats:

**TextToImage mapping:**

```typescript
const params: TextToImageParams = {
  prompt: "...",             // -> All providers
  negative_prompt: "...",    // -> HuggingFace, Gemini (ignored by DALL-E)
  width: 1024,              // -> HuggingFace (mapped to size for DALL-E)
  height: 1024,             // -> HuggingFace (mapped to size for DALL-E)
  guidance_scale: 7.5,      // -> HuggingFace (not used by DALL-E)
  num_inference_steps: 30,  // -> HuggingFace (not used by DALL-E)
  seed: 42,                 // -> HuggingFace (not supported by DALL-E)
  scheduler: "...",          // -> HuggingFace-specific
};
```

If a provider does not support a parameter (e.g., negative prompt for DALL-E), NodeTool automatically ignores or
remaps it.

**TextToVideo mapping:**

```typescript
const params: TextToVideoParams = {
  prompt: "...",           // -> All providers
  aspect_ratio: "16:9",   // -> Provider-specific interpretation
  resolution: "720p",     // -> Provider-specific interpretation
  num_frames: 60,         // -> Provider-specific (duration mapping)
  guidance_scale: 7.5,    // -> Provider-specific
};
```

### Best Practices

- Prefer generic nodes so you can swap providers without rewiring.
- Use provider-specific nodes only for unique features (e.g. Claude thinking mode, OpenAI vision detail).
- Test cheaper or faster models during development, switch to premium models for production.

## Provider Configuration Reference

### Environment Variables by Provider

| <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **OpenAI**      | `OPENAI_API_KEY`      | -                               |
| <img src="assets/icons/anthropic.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Anthropic**   | `ANTHROPIC_API_KEY`   | -                               |
| <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Gemini**      | `GEMINI_API_KEY`      | -                               |
| <img src="assets/icons/huggingface.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **HuggingFace** | `HF_TOKEN`            | -                               |
| <img src="assets/icons/ollama.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Ollama**      | -                     | `OLLAMA_API_URL`                |
| <img src="assets/icons/vllm.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **vLLM**        | -                     | `VLLM_BASE_URL`, `VLLM_API_KEY` |
| <img src="assets/icons/replicate.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Replicate**   | `REPLICATE_API_TOKEN` | -                               |
| <img src="assets/icons/fal.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **FAL**         | `FAL_API_KEY`         | -                               |
| <img src="assets/icons/elevenlabs.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **ElevenLabs**  | `ELEVENLABS_API_KEY`  | -                               |
| **Groq**         | `GROQ_API_KEY`        | -                               |
| **Mistral**      | `MISTRAL_API_KEY`     | -                               |
| **Cerebras**     | `CEREBRAS_API_KEY`    | -                               |
| **OpenRouter**   | `OPENROUTER_API_KEY`  | -                               |
| **LM Studio**    | `LMSTUDIO_API_KEY` (optional) | `LMSTUDIO_API_URL` (default `http://127.0.0.1:1234`) |
| **Together AI**  | `TOGETHER_API_KEY`    | -                               |
| **Moonshot (Kimi)** | `KIMI_API_KEY`     | -                               |


### Getting API Keys

- <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **OpenAI:** https://platform.openai.com/api-keys
- <img src="assets/icons/anthropic.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Anthropic:** https://console.anthropic.com/settings/keys
- <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Google Gemini:** https://ai.google.dev/
- <img src="assets/icons/huggingface.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **HuggingFace:** https://huggingface.co/settings/tokens
- <img src="assets/icons/replicate.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Replicate:** https://replicate.com/account/api-tokens
- <img src="assets/icons/fal.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **FAL:** https://fal.ai/dashboard/keys
- <img src="assets/icons/elevenlabs.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **ElevenLabs:** https://elevenlabs.io/app/settings/api-keys
- **Groq:** https://console.groq.com/keys
- **Mistral:** https://console.mistral.ai/api-keys
- **Cerebras:** https://cloud.cerebras.ai/
- **OpenRouter:** https://openrouter.ai/keys
- **Together AI:** https://api.together.xyz/settings/api-keys
- **Moonshot (Kimi):** https://platform.moonshot.cn/console/api-keys
- **LM Studio:** No key needed — download from https://lmstudio.ai and start a local server

| 3D Provider     | Required Variables    |
| --------------- | --------------------- |
| **Hunyuan3D**   | `HUNYUAN3D_API_KEY`   |
| **Trellis**     | `TRELLIS_API_KEY`     |
| **TripoSR**     | `TRIPO_API_KEY`       |
| **Point-E**     | `POINT_E_API_KEY`     |
| **Meshy AI**    | `MESHY_API_KEY`       |
| **Rodin AI**    | `RODIN_API_KEY`       |

## Provider Development

To add a new provider:

1. **Create provider class** in `packages/runtime/src/providers/`

```typescript
import { BaseProvider } from "@nodetool/runtime";
import { registerProvider } from "@nodetool/runtime";
import type { Message, LanguageModel, ProviderId } from "@nodetool/runtime";

export class YourProvider extends BaseProvider {
  private apiKey: string;

  constructor(kwargs: Record<string, unknown> = {}) {
    super("your_provider" as ProviderId);
    this.apiKey =
      (kwargs.YOUR_PROVIDER_API_KEY as string) ??
      process.env.YOUR_PROVIDER_API_KEY ??
      "";
  }

  static requiredSecrets(): string[] {
    return ["YOUR_PROVIDER_API_KEY"];
  }

  async *generateMessages(
    messages: Message[],
    model: string
  ): AsyncIterable<ProviderStreamItem> {
    // Implement streaming message generation
  }

  async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [];
  }
}
```

2. **Register in `packages/runtime/src/providers/index.ts`**

```typescript
import { YourProvider } from "./your-provider.js";
export { YourProvider };
```

3. **Register the provider** in `packages/runtime/src/providers/provider-registry.ts`

```typescript
registerProvider("your_provider", YourProvider, {
  YOUR_PROVIDER_API_KEY: process.env.YOUR_PROVIDER_API_KEY,
});
```

4. **Add provider ID** to the `ProviderId` union in `packages/runtime/src/providers/types.ts`

5. **Add configuration** to `.env.example`

6. **Document** in this file

## Testing Providers

Test your provider implementation:

```bash
vitest run tests/providers/your-provider.test.ts
```

Example test structure:

```typescript
import { describe, it, expect } from "vitest";
import { getProvider } from "@nodetool/runtime";
import type { Message } from "@nodetool/runtime";

describe("YourProvider", () => {
  it("should generate a message", async () => {
    const provider = await getProvider("your_provider");
    const messages: Message[] = [{ role: "user", content: "Hello" }];

    const chunks: ProviderStreamItem[] = [];
    for await (const chunk of provider.generateMessages(messages, "your-model-id")) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
  });
});
```

## See Also

- [Chat API](chat-api.md) - WebSocket API for chat interactions and provider routing
- [Global Chat](global-chat.md) - UI reference for multi-turn chat threads
- [Agents](global-chat.md#agent-mode) - Using providers with the agent system
- [Workflow API](workflow-api.md) - Building workflows with providers
