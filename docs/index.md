---
layout: home
title: NodeTool Documentation
---

# Create Powerful AI Workflows


Visual workflow builder for local and cloud ML models. Build chatbots, automate tasks, generate content—your data stays local by default.

## What You Get

- **Local first** — Runs on your machine without vendor cloud infrastructure
- **Open source** — Inspect, modify, self-host the entire stack
- **Data stays yours** — Processes locally, never phones home or sends telemetry
- **No lock-in** — One portable workflow format from laptop to deployment

## Fast local inference

- **MLX** — Apple Silicon optimized (M1-M4) for LLMs, audio, speech, image generation
- **llama.cpp + whisper.cpp** — Fast LLM inference and speech recognition on any platform
- **vLLM** — Production-grade high-throughput inference engine
- **HuggingFace** — Transformers & Diffusers running locally, 24+ model types

## Use any provider

- Bring your own API keys for OpenAI, Anthropic, Gemini, Fal AI, Replicate, HuggingFace
- No markup, no middleman—direct API calls
- Or skip APIs entirely and use local models

## Features

- Visual canvas with drag-and-drop node editing
- Multimodal support (text, image, audio, video)
- Built-in vector database (ChromaDB) for RAG
- Real-time execution preview—inspect every step
- Chat interface to run workflows conversationally
- Asset manager for organizing files
- Model manager for downloading HuggingFace weights

## Quick Start

| Platform    | Download                                  | Requirements                            |
| ----------- | ----------------------------------------- | --------------------------------------- |
| **Windows** | [Download Installer](https://nodetool.ai) | Nvidia GPU recommended, 20GB free space |
| **macOS**   | [Download Installer](https://nodetool.ai) | M1+ Apple Silicon                       |
| **Linux**   | [Download AppImage](https://nodetool.ai)  | Nvidia GPU recommended                  |

### Hardware Requirements

**Local Model Inference:**

| Setup             | Hardware              | Notes                                                     |
| ----------------- | --------------------- | --------------------------------------------------------- |
| **Apple Silicon** | M1/M2/M3/M4 Mac       | 16GB+ RAM for LLM/TTS, 24GB+ for image generation        |
| **Windows/Linux** | NVIDIA GPU with CUDA  | 4GB+ VRAM for LLM/TTS, 8GB+ for image, 12GB+ for video   |
| **Cloud Only**    | No GPU required       | Use API providers (OpenAI, Anthropic, Replicate, FAL)    |

**After Install:**

1. Launch the app
2. Download models from the Model Manager
3. Connect nodes in the visual editor
4. Run workflows locally or deploy

## Bring Your Own Providers

Bring your own API keys. Direct API calls, no markup, no tracking.

**Supported providers:** OpenAI, Anthropic, Gemini, HuggingFace, Groq, Together, Replicate, Fal AI, Cohere, ElevenLabs, and more.

Set API keys in Settings → Providers. See our [Providers Guide](providers.md) for detailed configuration.

## Install Node Packs

Install and manage packs directly from the desktop app.

- Open Package Manager: Launch the Electron desktop app, then open the Package Manager from the Tools menu.
- Browse and search packages: Use the top search box to filter by package name, description, or repo id.
- Search nodes across packs: Use the "Search nodes" field to find nodes by title, description, or type. You can install the required pack directly from node results.

Learn more in our [Node Packs Guide](node-packs.md).

## Documentation

### Getting Started

- **[Installation](installation.md)** – Download and install NodeTool
- **[Getting Started](getting-started.md)** – Your first workflow and basic concepts
- **[Tips and Tricks](tips-and-tricks.md)** – Shortcuts and workflow ideas
- **[Cookbook](cookbook.md)** – Cookbook for workflows
- **UI Overview** – Read [User Interface](user-interface.md) for a full map of the application.

### Core Features

- **[Workflow Editor](workflow-editor.md)** – Build workflows with drag-and-drop nodes
- **[User Interface](user-interface.md)** – Complete guide to the NodeTool UI
- **[Global Chat](global-chat.md)** – AI chat interface with agents and tools
- **[Supported Models](models.md)** – Comprehensive guide to all AI models and providers
- **[Providers](providers.md)** – Provider configuration and API key setup
- **[Models Manager](models-manager.md)** – Manage AI models and providers
- **[Asset Management](asset-management.md)** – Handle files, images, and media
- **[Base Nodes Reference](base-nodes.md)** – Complete reference for all available base nodes

### Advanced Topics

- **[Architecture](architecture.md)** – Technical overview and system design

## Community

- **[Discord](https://discord.gg/WmQTWZRcYE)** — Get help, share workflows
- **[GitHub](https://github.com/nodetool-ai/nodetool)** — Report bugs, request features
- **Contribute** — Pull requests welcome

Open source under AGPL‑3.0. Built by makers, for makers.
