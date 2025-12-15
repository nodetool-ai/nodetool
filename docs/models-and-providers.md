---
layout: page
title: "Models & Providers"
description: "Pick the right mix of local models and hosted providers for every workflow."
---

NodeTool lets you combine **local inference engines, downloaded checkpoints, and hosted APIs** inside the same workflow. Use this page as the launchpad for everything related to model setup and provider configuration.

## What to read next

- **[Supported Models](models.md)** — Full breakdown of llama.cpp, MLX, Whisper, Flux, Stable Diffusion, and more local engines.
- **[Providers Guide](providers.md)** — Configure OpenAI, Anthropic, Gemini, Groq, Together, RunPod, Fal.ai, and custom endpoints.
- **[HuggingFace Integration](huggingface.md)** — Comprehensive guide to 27+ HuggingFace node categories with 500,000+ models for text, image, audio, and multimodal processing.
- **[Models Manager](models-manager.md)** — Download queues, disk usage tracking, and quick model switching.
- **[Proxy & Self-Hosted Deployments](proxy.md)** — Route remote workers securely and expose GPU hosts without leaking secrets.

## Common tasks

1. **Install baseline models**  
   Open the in-app **Models Manager** and download GPT-OSS (LLM) plus Flux (image) so default templates work offline. See [Getting Started – Step 1](getting-started.md#step-1--install-nodetool).

2. **Connect a cloud provider**  
   Go to **Settings → Providers**, add your API key, and map nodes to that provider using the **Models** button on the node. Follow the [Providers Guide](providers.md#getting-api-keys).

3. **Mix local + remote nodes**  
   Keep sensitive preprocessing local (Whisper, ChromaDB), then fan out to hosted generation nodes. The [Cookbook patterns](cookbook.md) show hybrid examples.

4. **Deploy model-heavy workflows**  
   When you need GPUs beyond your laptop, export the workflow unchanged to RunPod or Cloud Run using the [Deployment Guide](deployment.md) or [Deployment Journeys](deployment-journeys.md).

Keeping models and providers organized here ensures every workflow can run locally for privacy, then burst to the cloud only when necessary.
