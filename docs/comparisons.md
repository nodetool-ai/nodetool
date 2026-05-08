---
layout: page
title: "How NodeTool Compares"
description: "Where NodeTool sits relative to Weavy and ComfyUI."
---

NodeTool is the open creative AI workspace: one node canvas for image, video, audio, and text models. Runs on your machine, or BYOK to FAL, Kie, OpenAI, Anthropic, Gemini, Replicate, and more.

Weavy is a closed SaaS canvas with its own credit system. ComfyUI is engineer-first and built around diffusion internals. NodeTool is the open alternative: every major model, your keys, your canvas — no credit markup, no vendor lock-in.

---

## Feature Comparison

| Feature | NodeTool | Weavy | ComfyUI |
|---------|----------|-------|---------|
| **Category** | Open creative AI workspace | Closed SaaS creative canvas | Diffusion-focused node editor |
| **License** | AGPL-3.0 (open source) | Proprietary SaaS | GPL-3.0 (open source) |
| **Runs on your machine** | ✅ Mac, Windows, Linux desktop | ❌ Browser-only, hosted | ✅ Local-first |
| **Bring your own keys (BYOK)** | ✅ FAL, Kie, OpenAI, Anthropic, Gemini, Replicate, Atlas, ElevenLabs, MiniMax | ❌ Credits only, provider markup | ⚠️ Via custom nodes for cloud APIs |
| **Pricing model** | Pay providers directly, no markup | Proprietary credits | Free (you pay your own GPU/API) |
| **Model coverage** | Image, video, audio, text, TTS, ASR — local + cloud | Image, video, audio — cloud only | Diffusion (image/video) — local |
| **Image generation** | Local: FLUX, Qwen Image · API: FAL, Kie, Replicate, OpenAI, Gemini | Cloud: FLUX, Seedance, Ideogram, etc. | Deep control over diffusion internals |
| **Video generation** | Local: Wan · API: FAL, Kie, Sora, Veo, Kling | Cloud: Kling, Veo, Runway, etc. | Local diffusion video (AnimateDiff, etc.) |
| **Audio & music** | Local: MusicGen, AudioLDM, Stable Audio · API: Kie, ElevenLabs, MiniMax | Cloud: Suno, ElevenLabs, etc. | ⚠️ Via custom nodes |
| **TTS / ASR** | Local: Kokoro, Sesame, Whisper · API: OpenAI, ElevenLabs | Cloud only | ⚠️ Via custom nodes |
| **LLMs & agents** | Built-in agent nodes, tool calling, streaming, Ollama, MLX | Limited LLM nodes | ⚠️ Via custom nodes |
| **Diffusion control** | Standard parameters | ❌ Hidden behind presets | ✅ Latents, VAE, samplers, ControlNet |
| **RAG / vector search** | ✅ Local Chroma | ❌ | ❌ |
| **Mini-apps from workflows** | ✅ Turn a graph into a simple UI | ⚠️ Share-as-template | ❌ |
| **Real-time streaming** | ✅ Token-by-token, live progress | ✅ Live preview | ❌ Queue-based execution |
| **Source available** | ✅ Full source on GitHub | ❌ | ✅ Full source on GitHub |

### When to pick each

**NodeTool** — open creative AI workspace. Wire image, video, audio, and text models on one canvas, with your own keys, on your own machine.

**Weavy** — hosted SaaS canvas if you want a managed product with credits and don't need local execution, BYOK, or open source.

**ComfyUI** — deep diffusion control: samplers, VAE, ControlNet, latents.

---

## See Also

- [Getting Started](getting-started.md)
- [Models & Providers](models-and-providers.md)
