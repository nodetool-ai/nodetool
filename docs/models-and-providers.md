---
layout: page
title: "Models & Providers"
description: "Local and cloud models in NodeTool."
---

> **Overview / start here.** For the full catalog of model families see [Supported Models](models.md); for connecting and configuring each provider see [Providers](providers.md); for the desktop download panel see [Models Manager](models-manager.md).

Run models locally, through cloud APIs with your own keys, or both in the same graph.

## Local vs. cloud

### Local

- Data stays on your disk
- Free after download
- Works offline
- 4–20 GB per model; needs a capable GPU or Apple Silicon

### Cloud (BYOK)

- No download
- Runs on the provider's hardware
- Latest model releases
- Billed by the provider, at the provider's price — no NodeTool markup
- Requires internet; data goes to the provider

### Mixed

Pick the best provider per node:
- ASR (Whisper) — local for sensitive audio
- Image generation — Flux locally for control, FAL/KIE cloud for speed
- Document processing — local for confidential files

---

## Cloud models

Available through provider nodes:

### Top 3D Generation Models

Two cloud 3D runtime providers are available:

| Model | Provider | Capabilities | Key Features |
|-------|----------|-------------|--------------|
| **Meshy AI** | Meshy (`MESHY_API_KEY`) | T2M/I2M | Textured mesh generation |
| **Rodin AI** | Rodin (`RODIN_API_KEY`) | T2M/I2M | High fidelity 3D creation |

Other 3D model families — Hunyuan3D, Trellis, TripoSR, Shap-E, Point-E — are run through HuggingFace / base-node 3D nodes rather than dedicated runtime providers. Their key names are node-level secret prompts in the editor, not backend providers. See [Providers](providers.md) for details.

### Top Video Generation Models

| Model | Provider | Capabilities | Key Features |
|-------|----------|-------------|--------------|
| **OpenAI Sora 2 Pro** | <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | T2V/I2V up to 15s | Realistic motion, refined physics, synchronized native audio, 1080p output |
| **Google Veo 3.1** | <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | T2V/I2V with references | Upgraded realistic motion, extended clip length, multi-image references, native 1080p with synced audio |
| **ByteDance Seedance 2.0** | ByteDance | T2V/I2V | High-quality cinematic video with stable characters and smooth motion |
| **Runway Gen-3 Alpha / Aleph** | Runway | T2V/I2V/Extend | Professional-grade video generation with precise motion control and high fidelity |
| **Luma** | Luma AI | Video editing/modification | AI-powered video modification and creative editing |
| **xAI Grok Imagine** | <img src="assets/icons/xai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> xAI | T2V/I2V/T2I | Multimodal text/image to short video with coherent motion and synchronized audio; also text-to-image |
| **Alibaba Wan 2.6** | <img src="assets/icons/alibaba.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Alibaba | Multi-shot T2V/I2V | Affordable 1080p with stable characters and native audio; reference-guided generation |
| **MiniMax Hailuo 2.3** | <img src="assets/icons/minimax.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> MiniMax | High-fidelity T2V/I2V | Expressive characters, complex motion and lighting effects |
| **Kling 3.0** | <img src="assets/icons/kling.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Kling | T2V/I2V with audio | Text/image to synchronized video with speech, ambient sound, and effects; strong audio-visual coherence |

### Top Image Generation Models

| Model | Provider | Capabilities | Key Features |
|-------|----------|-------------|--------------|
| **Black Forest Labs FLUX.2** | <img src="assets/icons/bfl.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> BFL | T2I with control | Photoreal images, multi-reference consistency, accurate text rendering, flexible control |
| **Google Nano Banana 2.0** | <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | High-res T2I/Edit | Sharper 2K output, 4K upscaling, improved text rendering, better character consistency |
| **GPT Image 2** | <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | T2I/Edit | High-quality photorealistic generation and instruction-based editing |
| **Ideogram V3** | Ideogram | T2I/Edit | Exceptional typography rendering and artistic style control |
| **Z-Image Turbo** | Z-AI | T2I | Fast high-quality text-to-image with strong prompt adherence |
| **Seedream 4.5** | ByteDance | T2I/Edit | High-fidelity image generation and instruction-based editing |

### Top Music & Audio Generation Models

| Model | Provider | Capabilities | Key Features |
|-------|----------|-------------|--------------|
| **Suno** | Suno | Music generation/extension | Full song creation from text prompts, with extend, cover, and remix features |
| **ElevenLabs V3 Dialogue** | <img src="assets/icons/elevenlabs.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> ElevenLabs | Text-to-dialogue | Multi-speaker dialogue generation with emotional control |

### Using These Models

Access these models through NodeTool's **generic nodes**:

1. **For Video**: Use `nodetool.video.TextToVideo` or `nodetool.video.ImageToVideo`
2. **For Images**: Use `nodetool.image.TextToImage`
3. **For 3D**: Use `nodetool.3d.TextTo3D` or `nodetool.3d.ImageTo3D`
4. **For Music**: Use kie.ai-backed Suno nodes (Suno Generate, Extend, Cover)
5. **Select Provider**: Click the model dropdown in the node properties
6. **Configure API**: Add provider API keys in `Settings → Providers`

**Access via kie.ai (recommended for broad model support):**
Many of these models are available through [kie.ai](https://kie.ai/), an AI provider aggregator that often offers competitive or lower pricing compared to upstream providers.
- Configure using `KIE_API_KEY` in `Settings → Providers`

**Access via fal.ai:**
- Configure using `FAL_API_KEY` in `Settings → Providers`


> **Cost Considerations**: Cloud models typically charge per generation. Check each provider's pricing before extensive use. Local models are free after download but require capable hardware.


---

## Getting Started

### Option 1: Start with Local Models (Recommended)

1. Open **Models → Model Manager** in NodeTool
2. Install these starter models:
   - **GPT-OSS** (~4 GB) – Text generation and chat
   - **Flux** (~12 GB) – High-quality image generation
3. Wait for downloads to complete
4. Run templates – they'll work offline!

### Option 2: Start with Cloud Providers

1. Get an API key from a provider:
   - <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> [OpenAI](https://platform.openai.com) – GPT, Whisper, Sora
   - <img src="assets/icons/anthropic.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> [Anthropic](https://www.anthropic.com) – Claude models
   - <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> [Google](https://ai.google.dev) – Gemini models
2. In NodeTool, go to **Settings → Providers**
3. Paste your API key
4. Select the provider when using AI nodes

---
## Detailed Guides

### General
- **[Models Manager](models-manager.md)** – Download and manage AI models
- **[Getting Started](getting-started.md)** – First workflow

### Local AI
- **[Supported Models](models.md)** – List of local models (llama.cpp, MLX, Whisper, Flux)

### Cloud AI
- **[Providers Guide](providers.md)** – Set up OpenAI, Anthropic, Google
- **[HuggingFace Integration](huggingface.md)** – Access 500,000+ models

### Advanced
- **[Proxy & Self-Hosted](proxy.md)** – Secure deployments
- **[Deployment Guide](deployment.md)** – Cloud infrastructure