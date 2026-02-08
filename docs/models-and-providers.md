---
layout: page
title: "Models & Providers"
description: "AI models and local vs cloud options."
---

This guide explains AI models in NodeTool and how to choose between local and cloud execution.

---

## What Are AI Models?

An AI **model** is a trained program for a specific task:

| Model Type | Function | Example |
|------------|----------|---------|
| **Language Model (LLM)** | Text generation | Stories, Q&A, summarization |
| **Image Model** | Image generation/editing | Artwork, photos, variations |
| **Speech Model** | Speech↔text conversion | Transcription, text-to-speech |
| **Vision Model** | Image understanding | Photo descriptions, OCR |
| **3D Model** | 3D asset generation | Product mockups, AR/VR assets |

Models come pre-trained. Select one for your task.

---

## Local vs. Cloud

NodeTool runs AI models locally or through cloud APIs.

### Local Models

**Pros:**
- 🔒 **Private** – Data stays local
- 💰 **Free** – No usage costs
- 📶 **Offline** – Works without internet

**Cons:**
- 💾 **Requires space** – 4-15 GB per model
- ⚡ **Needs hardware** – Faster with GPU
- ⏳ **Initial download** – One-time setup

### Cloud Models

**Pros:**
- 🚀 **Fast** – No downloads
- 💻 **Any hardware** – Works on older machines
- 🆕 **Latest models** – Access newest capabilities

**Cons:**
- 💵 **Usage costs** – Pay per task
- 🌐 **Requires internet**
- 📤 **Data sent externally**

### Mixed Approach (Recommended)

Combine local and cloud:
- **Speech recognition** – local for privacy
- **Image generation** – cloud for quality
- **Document processing** – local for confidential files

---

## Cloud Models for Creative Workflows

NodeTool provides access to high-quality generative AI models through cloud providers:

### Top 3D Generation Models

| Model | Provider | Capabilities | Key Features |
|-------|----------|-------------|--------------|
| **Hunyuan3D V2/3.0** | Hunyuan | T2M/I2M | High-quality 3D meshes and textures |
| **Trellis 2** | Trellis | T2M/I2M | Consistent geometry with textured output |
| **TripoSR** | Tripo | I2M | Fast image-to-3D reconstruction |
| **Shap-E** | OpenAI | T2M/I2M | Text or image prompt to 3D assets |
| **Point-E** | OpenAI | T2M | Point cloud generation |
| **Meshy AI** | Meshy | T2M/I2M | Textured mesh generation |
| **Rodin AI** | Rodin | T2M/I2M | High fidelity 3D creation |

### Top Video Generation Models

| Model | Provider | Capabilities | Key Features |
|-------|----------|-------------|--------------|
| **OpenAI Sora 2 Pro** | <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI | T2V/I2V up to 15s | Realistic motion, refined physics, synchronized native audio, 1080p output |
| **Google Veo 3.1** | <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | T2V/I2V with references | Upgraded realistic motion, extended clip length, multi-image references, native 1080p with synced audio |
| **xAI Grok Imagine** | <img src="assets/icons/xai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> xAI | T2V/I2V/T2I | Multimodal text/image to short video with coherent motion and synchronized audio; also text-to-image |
| **Alibaba Wan 2.6** | <img src="assets/icons/alibaba.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Alibaba | Multi-shot T2V/I2V | Affordable 1080p with stable characters and native audio; reference-guided generation |
| **MiniMax Hailuo 2.3** | <img src="assets/icons/minimax.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> MiniMax | High-fidelity T2V/I2V | Expressive characters, complex motion and lighting effects |
| **Kling 2.6** | <img src="assets/icons/kling.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Kling | T2V/I2V with audio | Text/image to synchronized video with speech, ambient sound, and effects; strong audio-visual coherence |

### Top Image Generation Models

| Model | Provider | Capabilities | Key Features |
|-------|----------|-------------|--------------|
| **Black Forest Labs FLUX.2** | <img src="assets/icons/bfl.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> BFL | T2I with control | Photoreal images, multi-reference consistency, accurate text rendering, flexible control |
| **Google Nano Banana Pro** | <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google | High-res T2I | Sharper 2K output, 4K upscaling, improved text rendering, better character consistency |

### Using These Models

Access these models through NodeTool's **generic nodes**:

1. **For Video**: Use `nodetool.video.TextToVideo` or `nodetool.video.ImageToVideo`
2. **For Images**: Use `nodetool.image.TextToImage`
3. **For 3D**: Use `nodetool.3d.TextTo3D` or `nodetool.3d.ImageTo3D`
3. **Select Provider**: Click the model dropdown in the node properties
4. **Configure API**: Add provider API keys in `Settings → Providers`

**Direct NodeTool API Key Support:**
- OpenAI Sora 2 Pro: `OPENAI_API_KEY`
- Google Veo 3.1: `GEMINI_API_KEY`
- MiniMax Hailuo 2.3: `MINIMAX_API_KEY`
- Hunyuan3D V2/3.0: `HUNYUAN3D_API_KEY`
- Trellis 2: `TRELLIS_API_KEY`
- TripoSR: `TRIPO_API_KEY`
- Shap-E: `SHAP_E_API_KEY`
- Point-E: `POINT_E_API_KEY`
- Meshy AI: `MESHY_API_KEY`
- Rodin AI: `RODIN_API_KEY`

- <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> OpenAI Sora 2 Pro: `OPENAI_API_KEY`
- <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> Google Veo 3.1: `GEMINI_API_KEY`
- <img src="assets/icons/minimax.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> MiniMax Hailuo 2.3: `MINIMAX_API_KEY`

**Access via kie.ai (recommended for other models):**
- xAI Grok Imagine, Alibaba Wan 2.6, Kling 2.6, Black Forest Labs FLUX.2, Google Nano Banana Pro
- Configure using `KIE_API_KEY` in `Settings → Providers`

> **Cost Considerations**: Cloud models typically charge per generation. Check each provider's pricing before extensive use. Local models are free after download but require capable hardware.

> **Alternative Access**: Many of these models are available through [kie.ai](https://kie.ai/), an AI provider aggregator that often offers competitive or lower pricing compared to upstream providers. For models without direct NodeTool API key support (xAI, Alibaba, Kling), kie.ai is the recommended access method.

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
   - <img src="assets/icons/openai.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> [OpenAI](https://platform.openai.com) – GPT-4, DALL-E, Whisper
   - <img src="assets/icons/anthropic.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> [Anthropic](https://www.anthropic.com) – Claude models
   - <img src="assets/icons/gemini.svg" width="16" height="16" style="vertical-align: middle;" alt="" /> [Google](https://ai.google.dev) – Gemini models
2. In NodeTool, go to **Settings → Providers**
3. Paste your API key
4. Select the provider when using AI nodes

---

## Understanding Model Names

Model names can look confusing, but they follow patterns:

| Name Part | Meaning | Example |
|-----------|---------|---------|
| **Base name** | The model family | GPT, Llama, Flux |
| **Number** | Version/size | GPT-4, Llama-3 |
| **Size indicator** | Capability level | mini, small, large |
| **Quantization** | Compression level | Q4, Q8 (lower = smaller file) |

**Example:** `llama-3-8b-instruct-Q4` means:
- Llama version 3
- 8 billion parameters (medium size)
- Instruction-tuned (follows directions well)
- Q4 quantization (compressed to save space)

**Don't memorize this** – NodeTool's Model Manager shows compatible models for each task.

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

---

## Quick Reference: Common Tasks

### "I want to generate text"
- **Local:** Install GPT-OSS or Llama model
- **Cloud:** Use OpenAI GPT-4 or Anthropic Claude

### "I want to create images"
- **Local:** Install Flux or Stable Diffusion
- **Cloud:** Use OpenAI DALL-E or Fal.ai

### "I want to transcribe audio"
- **Local:** Install Whisper (recommended for privacy)
- **Cloud:** Use OpenAI Whisper API

### "I want to understand images"
- **Local:** Install a Vision model (Llava, Qwen-VL)
- **Cloud:** Use GPT-4 Vision or Claude with images

---

## FAQ

**Q: Do I need a powerful computer?**  
A: For local models, a GPU helps but isn't required. Cloud providers work on any computer.

**Q: How much do cloud models cost?**  
A: Typically $0.001-0.03 per task. Most providers offer free credits.

**Q: Can I switch models later?**  
A: Yes. Use the **Model** button on any AI node to change models without rebuilding the workflow.

**Q: Local or cloud?**  
A: Depends on your needs. Try both.
