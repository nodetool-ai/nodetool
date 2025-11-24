---
layout: page
title: NodeTool Documentation
---

**Nodettol is a visual workflow builder for AI and machine learning**

NodeTool is an open source platform for building AI workflows through visual, node-based programming. Whether you're exploring ML models, automating tasks, or building chatbots, NodeTool helps you experiment and iterate quickly.

## Project Goals

NodeTool is built on these core principles:

- <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>**Privacy by design** — Your data processes locally by default, with no telemetry or tracking
- <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>**Local-first development** — Run everything on your machine without requiring cloud infrastructure
- <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>**Open and transparent** — Full source code available to inspect, modify, and self-host
- <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>**Freedom to choose** — Use local models or any API provider, with portable workflows that run anywhere
- <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>**Community-driven** — Built collaboratively by makers, researchers, and developers

> **License:** AGPL-3.0 — This project is free and open source software

## Capabilities

<div style="text-align: center; margin: 2rem 0;">
  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  </svg>
</div>

### Local Model Inference

Run AI models directly on your machine with optimized engines:

- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>**MLX** — Apple Silicon optimization (M1-M4) for LLMs, audio, speech, and image generation
- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>**llama.cpp + whisper.cpp** — Fast LLM inference and speech recognition across platforms
- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>**vLLM** — High-throughput inference engine for production workloads
- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>**HuggingFace** — Support for 24+ model types using Transformers & Diffusers

### Flexible API Integration

Choose your own providers and models:

- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>Connect with your own API keys for OpenAI, Anthropic, Gemini, Fal AI, Replicate, HuggingFace, and more
- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>Direct API calls with no intermediary services
- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>Works completely offline with local models when desired

### Core Features

- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>**Visual workflow editor** — Drag-and-drop interface for building node-based workflows
- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>**Multimodal processing** — Work with text, images, audio, and video in the same workflow
- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"/><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"/></svg>**Vector database** — Built-in ChromaDB integration for retrieval-augmented generation (RAG)
- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>**Real-time preview** — Inspect outputs at every step during execution
- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>**Conversational interface** — Run workflows through an integrated chat interface
- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>**Asset management** — Organize and manage your files and media
- <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>**Model management** — Download and configure HuggingFace models locally

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

<div style="text-align: center; margin: 3rem 0 2rem 0;">
  <svg width="80" height="2" viewBox="0 0 80 2" fill="none">
    <line x1="0" y1="1" x2="80" y2="1" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>
  </svg>
</div>

Built collaboratively by makers, researchers, and developers around the world.
