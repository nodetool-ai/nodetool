---
layout: page
title: "Models & Providers"
description: "Understand AI models and choose between local and cloud options – explained for beginners."
---

This guide explains how AI models work in NodeTool and helps you choose the right setup for your needs. **No prior AI knowledge required** – we'll explain everything in plain terms.

---

## What Are AI Models?

Think of an AI **model** as a specialized expert that has learned to do one thing really well:

| Model Type | What It Does | Example |
|------------|--------------|---------|
| **Language Model (LLM)** | Reads and writes text | Write stories, answer questions, summarize documents |
| **Image Model** | Creates or edits images | Generate artwork, edit photos, create variations |
| **Speech Model** | Converts between speech and text | Transcribe meetings, read documents aloud |
| **Vision Model** | Understands images | Describe photos, extract text from documents |

**You don't train models** – they come pre-trained and ready to use. Just pick one for your task!

---

## Local vs. Cloud: Which Should You Choose?

NodeTool lets you run AI models either on your computer (local) or through internet services (cloud). Here's how to decide:

### Local Models (On Your Computer)

**Pros:**
- 🔒 **Private** – Your data never leaves your machine
- 💰 **Free** – No usage costs after download
- 📶 **Offline** – Works without internet

**Cons:**
- 💾 **Requires space** – Models can be 4-15 GB each
- ⚡ **Needs power** – Faster with GPU, slower on CPU-only
- ⏳ **Initial download** – One-time setup required

**Best for:** Privacy-sensitive work, offline use, unlimited experimentation

### Cloud Models (Via Internet APIs)

**Pros:**
- 🚀 **Fast** – No downloads, start immediately
- 💻 **Any computer** – Works on older machines
- 🆕 **Latest models** – Access newest AI capabilities

**Cons:**
- 💵 **Costs money** – Pay per use (usually pennies per task)
- 🌐 **Needs internet** – Requires connection
- 📤 **Data sent** – Your prompts go to external servers

**Best for:** Quick start, limited hardware, accessing cutting-edge models

### Mix Both! (Recommended)

Most users benefit from combining local and cloud:
- Run **speech recognition locally** for privacy
- Use **cloud image generation** for quality
- Keep **document processing local** for confidential files

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

**Don't worry about memorizing this** – NodeTool's Model Manager shows you which models work for each task.

---

## Detailed Guides

Ready to dive deeper? Check these specialized guides:

### For Everyone
- **[Models Manager](models-manager.md)** – Download and manage AI models
- **[Getting Started](getting-started.md)** – Your first workflow

### For Local AI
- **[Supported Models](models.md)** – Complete list of local models (llama.cpp, MLX, Whisper, Flux, and more)

### For Cloud AI
- **[Providers Guide](providers.md)** – Set up OpenAI, Anthropic, Google, and other cloud services
- **[HuggingFace Integration](huggingface.md)** – Access 500,000+ models through HuggingFace

### For Advanced Users
- **[Proxy & Self-Hosted](proxy.md)** – Secure deployments with remote GPUs
- **[Deployment Guide](deployment.md)** – Run workflows on cloud infrastructure

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
A: Typically $0.001-0.03 per task. Most providers offer free credits to start.

**Q: Can I switch models later?**  
A: Yes! Use the **Model** button on any AI node to change models without rebuilding your workflow.

**Q: Which is better, local or cloud?**  
A: Neither is "better" – it depends on your needs. Try both and see what works for you!
