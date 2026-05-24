---
layout: page
title: "Why NodeTool"
description: "The problems NodeTool solves for creative teams working with AI models."
---

> NodeTool is the open creative AI workspace — every major model, your keys, one canvas.

NodeTool replaces the chatbox with a node canvas where image, video, audio, and LLM models run side by side. Bring your keys, or run everything locally. Open source, AGPL-3.0.

## The problem

Creative AI is a tab graveyard:

* **Every model lives behind its own UI.** Switching between Flux, ElevenLabs, Sora, and a chatbot means losing context every time. Outputs don't compose.
* **SaaS canvases tax every token.** Hosted creative tools mark up provider credits 2–5x. You pay for the same OpenAI call twice.
* **Local-only tools are model-narrow.** ComfyUI nails diffusion internals but treats LLMs, agents, and cloud APIs as second-class.
* **Workflows aren't portable.** Prompts in chat history, settings in screenshots, pipelines in your head. Nothing is reproducible.
* **Privacy is a yes/no toggle.** Either everything goes to a vendor, or nothing leaves your machine. No mixed mode.

## How NodeTool solves this

One canvas, every model, your keys:

**One canvas for every modality.** Wire Flux to GPT-5 to ElevenLabs to Wan in a single graph. Outputs flow as typed edges — image, audio, text, embeddings — not pasted strings.

**BYOK to every provider.** OpenAI, Anthropic, Gemini, Replicate, FAL, Kie, ElevenLabs, MiniMax, HuggingFace. Pay them directly. No credit markup, no provider lock-in.

**Local + cloud, mixed.** Run Llama on MLX, route image gen to FAL, send audio to ElevenLabs — in one workflow. Toggle per node.

**Workflows as files.** Save, share, version. Ship a workflow as a Mini-App with a one-click hide-the-graph mode.

**Agents that drive pipelines.** Built-in planning, tool calling, streaming. Drop an agent node into any graph.

**Open source, no markup.** AGPL-3.0. Cloud edition hosts the same code in this repo. Self-host the Docker images any time.

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

**NodeTool** — every modality, every provider, on one canvas. Local, cloud, or mixed.

**Weavy** — hosted SaaS if you want a managed product with credits and don't need BYOK, local execution, or open source.

**ComfyUI** — deep diffusion control: samplers, VAE, ControlNet, latents.

---

## Next steps

- [Quick Start](getting-started.md) — install and run your first workflow in minutes.
- [Models & Providers](models-and-providers.md) — every model NodeTool wires up.
