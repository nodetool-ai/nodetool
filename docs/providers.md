---
layout: page
title: "Providers"
description: "Connect NodeTool to OpenAI, Anthropic, Gemini, HuggingFace, FAL, Replicate, Ollama, vLLM and more — bring your own keys, switch providers without touching the graph."
---

> **Provider setup & capabilities.** For the list of model families, see [Supported Models](models.md). New here? Start with [Models & Providers](models-and-providers.md).

Providers are adapters between NodeTool nodes and specific AI services. Switch between OpenAI, Anthropic, Gemini, HuggingFace, FAL, KIE, Replicate, Ollama, vLLM, and others without changing the graph. You bring the keys.

## Overview

Modalities:

- **Text** — chat, completions
- **Image** — text-to-image, image-to-image
- **Video** — text-to-video, image-to-video
- **TTS** — text-to-speech
- **ASR** — speech-to-text
- **3D** — text-to-3D, image-to-3D

Pick a model from a node's property panel. Providers are grouped by family: OpenAI, Anthropic, Gemini, Hugging Face, Ollama, vLLM.

## Architecture

### Provider Capabilities

The capability system uses introspection to automatically detect which features a provider supports:

| Capability                     | Description                  | Method                           |
| ------------------------------ | ---------------------------- | -------------------------------- |
| `GENERATE_MESSAGE`             | Single message generation    | `generate_message()`             |
| `GENERATE_MESSAGES`            | Streaming message generation | `generate_messages()`            |
| `GENERATE_EMBEDDING`           | Text → embedding vectors     | `generate_embedding()`           |
| `TEXT_TO_IMAGE`                | Generate images from text    | `text_to_image()`                |
| `IMAGE_TO_IMAGE`               | Transform images with text   | `image_to_image()`               |
| `TEXT_TO_VIDEO`                | Generate videos from text    | `text_to_video()`                |
| `IMAGE_TO_VIDEO`               | Animate images into videos   | `image_to_video()`               |
| `TEXT_TO_SPEECH`               | Convert text to speech       | `text_to_speech()`               |
| `TEXT_TO_AUDIO`                | Generate music/audio         | `text_to_audio()`                |
| `AUTOMATIC_SPEECH_RECOGNITION` | Transcribe audio to text     | `automatic_speech_recognition()` |
| `TEXT_TO_3D`                   | Generate 3D models from text | `text_to_3d()`                   |
| `IMAGE_TO_3D`                  | Generate 3D models from image| `image_to_3d()`                  |

## Available Providers

### Language Model Providers

| Provider | File | Streaming | Tool calls | Vision | Notes |
|----------|------|-----------|------------|--------|-------|
| OpenAI | `openai-provider.ts` | ✅ | ✅ | ✅ | Includes GPT-Image, TTS, Whisper |
| Anthropic | `anthropic-provider.ts` | ✅ | ✅ | ✅ | JSON via tool use |
| Google Gemini | `gemini-provider.ts` | ✅ | ✅ | ✅ | File input via Blobs, Veo video |
| xAI (Grok) | `xai-provider.ts` | ✅ | ✅ | — | Grok models; `XAI_API_KEY` |
| DeepSeek | `deepseek-provider.ts` | ✅ | ✅ | — | DeepSeek-V3 and R1 reasoning; `DEEPSEEK_API_KEY` |
| Evolink | `evolink-provider.ts` | ✅ | ✅ | model-dependent | OpenAI-compatible gateway (GPT, Claude, Gemini, DeepSeek). Also image (GPT Image, Nano Banana 2, Seedream) and video (Seedance, Wan, Veo, Sora, Grok) generation; `EVOLINK_API_KEY` |
| Ollama | `ollama-provider.ts` | ✅ | model-dependent | Base64 | Local, no API key. `ollama pull` first |
| vLLM | `vllm-provider.ts` | ✅ | model-dependent | ✅ | OpenAI-compatible, self-hosted |
| HuggingFace | `huggingface-provider.ts` | ✅ | — | — | Hub models via FAL/Together/Replicate. See [HuggingFace Integration](huggingface.md) |
| Groq | `groq-provider.ts` | ✅ | ✅ | — | Ultra-fast inference via Groq LPU |
| Mistral | `mistral-provider.ts` | ✅ | ✅ | — | Mistral & Mixtral models |
| Cerebras | `cerebras-provider.ts` | ✅ | ✅ | — | High-throughput Cerebras inference |
| GMI Cloud | `gmi-provider.ts` | ✅ | ✅ | — | OpenAI-compatible inference for open-weight LLMs (Llama, DeepSeek, Qwen); `GMI_API_KEY` |
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
| ByteDance Seedance 2.0 | T2V, I2V | via kie.ai |
| Runway Gen-3 Alpha / Aleph | T2V, I2V, Extend | via kie.ai |
| Luma | Video modification | via kie.ai |
| xAI Grok Imagine | T2V, I2V, T2I | via kie.ai |
| Alibaba Wan 2.6 | T2V, I2V, multi-shot | via kie.ai |
| Kling 3.0 | T2V, I2V with audio | via kie.ai |

### Image Generation Providers

| Provider | Access |
|----------|--------|
| Black Forest Labs FLUX.2 Pro | via kie.ai or direct API |
| Google Nano Banana 2.0 / Imagen 4 | `GEMINI_API_KEY` or via kie.ai |
| OpenAI GPT Image 2 | `OPENAI_API_KEY` or via kie.ai |
| OpenAI GPT-Image 2/3 | `OPENAI_API_KEY` |
| Ideogram V3 | via kie.ai |
| Z-Image Turbo | via kie.ai |
| ByteDance Seedream 4.5 | via kie.ai |

### Music & Audio Generation Providers

| Provider | Capabilities | Access |
|----------|--------------|--------|
| Suno | Music generation, extend, cover, remix | via kie.ai (`KIE_API_KEY`) |
| ElevenLabs | TTS, dialogue, sound effects, audio isolation | `ELEVENLABS_API_KEY` or via kie.ai |

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

**kie.ai** — `KIE_API_KEY`. Unified access to multiple models via a single API. Recommended for providers without direct NodeTool API key support (ByteDance Seedance, Runway, Luma, xAI Grok Imagine, Alibaba Wan 2.6, Kling 3.0, FLUX.2, Nano Banana 2.0, Ideogram V3, Z-Image Turbo, Suno, and more).

**Evolink** — `EVOLINK_API_KEY`. OpenAI/Anthropic-compatible gateway for chat (GPT, Claude, Gemini, DeepSeek) plus an asynchronous task API for image (GPT Image 2, Nano Banana 2, Seedream 5.0) and video (Seedance 2.0, Wan 2.6, Veo 3.1, Sora 2 Pro, Grok Imagine) generation behind one key.

## Generic Nodes: Provider-Agnostic Workflows

Generic nodes in the `nodetool.*` namespace accept a `model` parameter and route to the matching provider. Use these to switch providers without rewiring the graph.

| Node | Switch between |
|------|---------------|
| `nodetool.agents.Agent` | OpenAI, Anthropic, Gemini, xAI, DeepSeek, Ollama, any LLM |
| `nodetool.image.TextToImage` | FLUX.2, Nano Banana 2.0, GPT Image 2, Ideogram V3, Z-Image, GPT-Image, HuggingFace, ComfyUI, MLX |
| `nodetool.image.ImageToImage` | HuggingFace, local servers, cloud services |
| `nodetool.video.TextToVideo` | Sora 2 Pro, Veo 3.1, Seedance 2.0, Runway, Grok Imagine, Wan 2.6, Hailuo 2.3, Kling 3.0, HuggingFace |
| `nodetool.video.ImageToVideo` | Sora 2 Pro, Veo 3.1, Seedance 2.0, Runway, Luma, Grok Imagine, Wan 2.6, Hailuo 2.3, Kling 3.0, Stability AI |
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
  negative_prompt: "...",    // -> HuggingFace, Gemini (ignored by GPT-Image)
  width: 1024,              // -> HuggingFace (mapped to size for GPT-Image)
  height: 1024,             // -> HuggingFace (mapped to size for GPT-Image)
  guidance_scale: 7.5,      // -> HuggingFace (not used by GPT-Image)
  num_inference_steps: 30,  // -> HuggingFace (not used by GPT-Image)
  seed: 42,                 // -> HuggingFace (not supported by GPT-Image)
  scheduler: "...",          // -> HuggingFace-specific
};
```

If a provider does not support a parameter (e.g., negative prompt for GPT-Image), NodeTool automatically ignores or
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
| **xAI (Grok)**   | `XAI_API_KEY`         | -                               |
| **DeepSeek**     | `DEEPSEEK_API_KEY`    | -                               |
| **Evolink**      | `EVOLINK_API_KEY`     | -                               |
| <img src="assets/icons/huggingface.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **HuggingFace** | `HF_TOKEN`            | -                               |
| <img src="assets/icons/ollama.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Ollama**      | -                     | `OLLAMA_API_URL`                |
| <img src="assets/icons/vllm.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **vLLM**        | -                     | `VLLM_BASE_URL`, `VLLM_API_KEY` |
| <img src="assets/icons/replicate.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Replicate**   | `REPLICATE_API_TOKEN` | -                               |
| <img src="assets/icons/fal.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **FAL**         | `FAL_API_KEY`         | -                               |
| <img src="assets/icons/elevenlabs.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **ElevenLabs**  | `ELEVENLABS_API_KEY`  | -                               |
| **Groq**         | `GROQ_API_KEY`        | -                               |
| **Mistral**      | `MISTRAL_API_KEY`     | -                               |
| **Cerebras**     | `CEREBRAS_API_KEY`    | -                               |
| **GMI Cloud**    | `GMI_API_KEY`         | -                               |
| **OpenRouter**   | `OPENROUTER_API_KEY`  | -                               |
| **LM Studio**    | `LMSTUDIO_API_KEY` (optional) | `LMSTUDIO_API_URL` (default `http://127.0.0.1:1234`) |
| **Together AI**  | `TOGETHER_API_KEY`    | -                               |
| **Moonshot (Kimi)** | `KIMI_API_KEY`     | -                               |
| **kie.ai**       | `KIE_API_KEY`         | -                               |


### Getting API Keys

- <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **OpenAI:** https://platform.openai.com/api-keys
- <img src="assets/icons/anthropic.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Anthropic:** https://console.anthropic.com/settings/keys
- <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Google Gemini:** https://ai.google.dev/
- **xAI (Grok):** https://console.x.ai/
- **DeepSeek:** https://platform.deepseek.com/api_keys
- <img src="assets/icons/huggingface.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **HuggingFace:** https://huggingface.co/settings/tokens
- <img src="assets/icons/replicate.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **Replicate:** https://replicate.com/account/api-tokens
- <img src="assets/icons/fal.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **FAL:** https://fal.ai/dashboard/keys
- <img src="assets/icons/elevenlabs.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> **ElevenLabs:** https://elevenlabs.io/app/settings/api-keys
- **Groq:** https://console.groq.com/keys
- **Mistral:** https://console.mistral.ai/api-keys
- **Cerebras:** https://cloud.cerebras.ai/
- **GMI Cloud:** https://console.gmicloud.ai/
- **OpenRouter:** https://openrouter.ai/keys
- **Together AI:** https://api.together.xyz/settings/api-keys
- **Moonshot (Kimi):** https://platform.moonshot.cn/console/api-keys
- **LM Studio:** No key needed — download from https://lmstudio.ai and start a local server
- **kie.ai:** https://kie.ai/ (unified multi-model access)

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
import { BaseProvider } from "@nodetool-ai/runtime";
import { registerProvider } from "@nodetool-ai/runtime";
import type { Message, LanguageModel, ProviderId } from "@nodetool-ai/runtime";

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
import { getProvider } from "@nodetool-ai/runtime";
import type { Message } from "@nodetool-ai/runtime";

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
