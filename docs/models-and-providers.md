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
   - [OpenAI](https://platform.openai.com) – GPT-4, DALL-E, Whisper
   - [Anthropic](https://www.anthropic.com) – Claude models
   - [Google](https://ai.google.dev) – Gemini models
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
