---
layout: page
title: NodeTool Documentation
---

**Nodettol is a visual workflow builder for AI and machine learning**

NodeTool is an open source platform for building AI workflows through visual, node-based programming. Whether you're exploring ML models, automating tasks, or building chatbots, NodeTool helps you experiment and iterate quickly.

## Project Goals

NodeTool is built on these core principles:

- **Privacy by design** — Your data processes locally by default, with no telemetry or tracking
- **Local-first development** — Run everything on your machine without requiring cloud infrastructure
- **Open and transparent** — Full source code available to inspect, modify, and self-host
- **Freedom to choose** — Use local models or any API provider, with portable workflows that run anywhere
- **Community-driven** — Built collaboratively by makers, researchers, and developers

> **License:** AGPL-3.0 — This project is free and open source software

## Capabilities

### Local Model Inference

Run AI models directly on your machine with optimized engines:

- **MLX** — Apple Silicon optimization (M1-M4) for LLMs, audio, speech, and image generation
- **llama.cpp + whisper.cpp** — Fast LLM inference and speech recognition across platforms
- **vLLM** — High-throughput inference engine for production workloads
- **HuggingFace** — Support for 24+ model types using Transformers & Diffusers

### Flexible API Integration

Choose your own providers and models:

- Connect with your own API keys for OpenAI, Anthropic, Gemini, Fal AI, Replicate, HuggingFace, and more
- Direct API calls with no intermediary services
- Works completely offline with local models when desired

### Core Features

- **Visual workflow editor** — Drag-and-drop interface for building node-based workflows
- **Multimodal processing** — Work with text, images, audio, and video in the same workflow
- **Vector database** — Built-in ChromaDB integration for retrieval-augmented generation (RAG)
- **Real-time preview** — Inspect outputs at every step during execution
- **Conversational interface** — Run workflows through an integrated chat interface
- **Asset management** — Organize and manage your files and media
- **Model management** — Download and configure HuggingFace models locally

## Installation

### Desktop Application

Pre-built installers are available for all platforms:

| Platform    | Download                                  | Requirements                            |
| ----------- | ----------------------------------------- | --------------------------------------- |
| **Windows** | [Download Installer](https://nodetool.ai) | Nvidia GPU recommended, 20GB free space |
| **macOS**   | [Download Installer](https://nodetool.ai) | M1+ Apple Silicon                       |
| **Linux**   | [Download AppImage](https://nodetool.ai)  | Nvidia GPU recommended                  |

### Hardware Requirements

**For local model inference:**

| Setup             | Hardware              | Notes                                                     |
| ----------------- | --------------------- | --------------------------------------------------------- |
| **Apple Silicon** | M1/M2/M3/M4 Mac       | 16GB+ RAM for LLM/TTS, 24GB+ for image generation        |
| **Windows/Linux** | NVIDIA GPU with CUDA  | 4GB+ VRAM for LLM/TTS, 8GB+ for image, 12GB+ for video   |
| **API-only mode** | No GPU required       | Use cloud providers (OpenAI, Anthropic, Replicate, FAL)  |

### First Steps

1. Launch NodeTool
2. (Optional) Download models from the Model Manager
3. Create your first workflow by connecting nodes in the visual editor
4. Run workflows locally or configure API providers

### Developer Installation

To build from source and contribute to development, see the [Installation Guide](installation.md) for detailed instructions.

## Configuration

### API Providers

NodeTool supports connecting your own API keys for direct access to various AI services:

**Supported providers:** OpenAI, Anthropic, Gemini, HuggingFace, Groq, Together, Replicate, Fal AI, Cohere, ElevenLabs, and more.

Configure API keys in **Settings → Providers**. For detailed setup instructions, see the [Providers Guide](providers.md).

### Node Packs

Extend NodeTool's functionality by installing additional node packages:

1. **Open Package Manager** — From the desktop app, select **Tools → Package Manager**
2. **Browse packages** — Use the search box to filter by package name, description, or repository
3. **Search for specific nodes** — Find nodes by title, description, or type across all available packs
4. **Install** — Install packages directly from search results

For more details, see the [Node Packs Guide](node-packs.md).

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
- **[Node Reference](nodes/)** – Complete reference for all available nodes

### Advanced Topics

- **[Architecture](architecture.md)** – Technical overview and system design

## Community and Contributing

NodeTool is developed in the open, and we welcome participation from everyone.

### Get Involved

- **[Discord](https://discord.gg/WmQTWZRcYE)** — Ask questions, share workflows, discuss ideas, and connect with other users
- **[GitHub](https://github.com/nodetool-ai/nodetool)** — Report issues, request features, submit pull requests, and browse the source code
- **[Documentation](https://github.com/nodetool-ai/nodetool/tree/main/docs)** — Help improve these docs with corrections or additions

### Contributing

We welcome contributions of all kinds:

- **Bug reports and feature requests** — Help us identify issues and prioritize improvements
- **Code contributions** — Fix bugs, add features, or improve performance
- **Documentation** — Clarify instructions, add examples, or fix typos
- **Node development** — Create new nodes to extend NodeTool's capabilities
- **Workflow sharing** — Share interesting workflows with the community

Pull requests are welcome! For major changes, please open an issue first to discuss your ideas.

### License

NodeTool is free and open source software, released under the [AGPL-3.0 license](https://github.com/nodetool-ai/nodetool/blob/main/LICENSE).

---

Built collaboratively by makers, researchers, and developers around the world.
