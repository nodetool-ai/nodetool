# NodeTool: Local-First AI Workflow Builder

![Release](https://github.com/nodetool-ai/nodetool/actions/workflows/release.yaml/badge.svg)
[![Lint and Test](https://github.com/nodetool-ai/nodetool/actions/workflows/test.yml/badge.svg)](https://github.com/nodetool-ai/nodetool/actions/workflows/test.yml)
![CodeQL](https://github.com/nodetool-ai/nodetool/actions/workflows/github-code-scanning/codeql/badge.svg)

[![Stars](https://img.shields.io/github/stars/nodetool-ai/nodetool?style=social)](https://github.com/nodetool-ai/nodetool/stargazers)
[![Downloads](https://img.shields.io/github/downloads/nodetool-ai/nodetool/total?color=3fb950)](https://github.com/nodetool-ai/nodetool/releases)
[![Latest Release](https://img.shields.io/github/v/release/nodetool-ai/nodetool?display_name=tag&sort=semver)](https://github.com/nodetool-ai/nodetool/releases/latest)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fnodetool.ai)](https://nodetool.ai)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/WmQTWZRcYE)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE.txt)

**Build AI Workflows Visually. Run Them Anywhere.**

NodeTool is an open-source visual workflow builder. Design AI pipelines on your laptop, then deploy the same workflow to RunPod, Cloud Run, or your own servers—no code changes needed. Run powerful models locally or in the cloud. Your data stays with you.

![Screenshot](screenshot.png)

## Core Principles

- **Local First**: Run models on your machine. No mandatory cloud calls. Your data never leaves unless you want it to.
- **Portable**: Build on your laptop, deploy anywhere. Same workflow runs on RunPod, Cloud Run, or self-hosted—no rewrites.
- **Open & Inspectable**: See every step in real-time. Debug with confidence. AGPL-3.0 licensed—inspect and modify everything.
- **Flexible**: Start with local models (free, private), switch to cloud APIs when you need them. You choose.

## Features

- **Visual Workflow Engine**: Drag-and-drop AI pipelines. Real-time execution, type safety, multimodal support (text, image, audio, video). Watch results stream as they generate.
- **Universal Inference**: Run SOTA models (LLMs, Flux, SDXL) on Apple Silicon (MLX), NVIDIA GPUs, or CPU (llama.cpp). No API fees. Works offline.
- **HuggingFace Integration**: Access 500,000+ models from the Hub. Download and run them directly in your workflows.
- **Flexible Providers**: Mix local models with cloud APIs (OpenAI, Anthropic, Gemini, Replicate). Use the best tool for each job.
- **One-Click Deployment**: `nodetool deploy` pushes your workflow to RunPod, Cloud Run, or self-hosted. Same code, any environment.
- **Asset Management**: Built-in manager for media files. Organize, persist, and access from any node.

## Use Cases

- **Smart Assistants**: Chat with local documents. Build RAG systems that keep your data private.
- **Agentic Workflows**: Create AI agents that plan and execute. Search, classify, automate—all visual.
- **Content Creation**: Generate images, video, music. Chain multiple AI models into creative pipelines.
- **Data Analysis**: Transform data with AI. Extract insights, create visualizations, automate reports.

## Quick Start

| Platform | Download | Requirements |
| :--- | :--- | :--- |
| **Windows** | [Download Installer](https://nodetool.ai) | Nvidia GPU recommended, 20GB free space |
| **macOS** | [Download Installer](https://nodetool.ai) | M1+ Apple Silicon |
| **Linux** | [Download AppImage](https://nodetool.ai) | Nvidia GPU recommended |

**Hardware for Local Inference:**

- **Apple Silicon**: 16GB+ RAM (LLM/TTS), 24GB+ (Image Gen)
- **Windows/Linux**: 4GB+ VRAM (LLM/TTS), 8GB+ (Image), 12GB+ (Video)
- **Cloud Only**: No GPU required.

______________________________________________________________________

## Documentation

- **[Getting Started](https://docs.nodetool.ai/getting-started)**
- **[Node Packs](https://docs.nodetool.ai/packs)**
- **[Custom Nodes](https://docs.nodetool.ai/development/custom-nodes)**
- **[Deployment](https://docs.nodetool.ai/deployment)**
- **[API Reference](https://docs.nodetool.ai/api)**

______________________________________________________________________

## 🛠️ Development Setup

For core library development, see [nodetool-core](https://github.com/nodetool-ai/nodetool-core).

### Prerequisites

- Python 3.11, Conda, Node.js LTS

### Quick Start

```bash
# 1. Setup Environment
conda env update -f environment.yml --prune
conda activate nodetool

# 2. Install Core
uv pip install git+https://github.com/nodetool-ai/nodetool-core git+https://github.com/nodetool-ai/nodetool-base

# 3. Run Backend & Frontend
nodetool serve --reload &
cd web && npm install && npm start
```

### Installing HuggingFace pack (Linux/Windows GPU)

Requires CUDA Driver version for linux: >=525.60.13
Requires CUDA Driver version for windows: >=527.41

```bash
uv pip install git+https://github.com/nodetool-ai/nodetool-huggingface --extra-index-url https://download.pytorch.org/whl/cu128
```

### Installing MLX pack (Apple Silicon)

```bash
uv pip install git+https://github.com/nodetool-ai/nodetool-mlx
```

### Electron App

Configure `settings.yaml` with your Conda path and run `make electron`.

### Mobile App

The mobile app allows you to run Mini Apps on iOS and Android devices.

```bash
cd mobile && npm install && npm start
```

See [mobile/README.md](mobile/README.md) for detailed setup and usage instructions.

## Testing

```bash
cd electron && npm test && npm run lint
cd web && npm test && npm run lint
```

## Contributing

We welcome contributions!

- **Bug reports & Features**: Help us improve.
- **Code**: Fix bugs or add features.
- **Nodes**: Create new nodes.

**Pull requests are welcome!** Open an issue for major changes.

## License

[AGPL-3.0 license](https://github.com/nodetool-ai/nodetool/blob/main/LICENSE).

## Get in Touch

- **General**: [hello@nodetool.ai](mailto:hello@nodetool.ai)
- **Team**: [matti@nodetool.ai](mailto:matti@nodetool.ai), [david@nodetool.ai](mailto:david@nodetool.ai)

[GitHub](https://github.com/nodetool-ai/nodetool) • [Discord](https://discord.gg/WmQTWZRcYE)
