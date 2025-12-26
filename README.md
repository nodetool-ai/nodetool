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

**Build AI Workflows Visually. Locally.**

NodeTool is an open-source visual environment for building, testing, and deploying AI workflows. Connect powerful models running locally or in the cloud. No API keys needed for local inference. Your data stays with you.

![Screenshot](screenshot.png)

## Core Principles

- **Local First**: Run entirely on your machine. No cloud dependency.
- **Open Source**: AGPL-3.0 licensed. Inspect, modify, and self-host.
- **Private**: No telemetry. No tracking. Your data is yours.
- **Portable**: Workflows run anywhere, from laptop to cloud.

## Features

- **Visual Workflow Engine**: Drag-and-drop interface with real-time execution, type safety, and multimodal support (text, image, audio, video).
- **Universal Inference**: Run SOTA models (LLMs, Flux, SDXL) natively on Apple Silicon (MLX), NVIDIA GPUs, or CPU (llama.cpp).
- **HuggingFace Integration**: Download and run thousands of models directly from the Hub.
- **Flexible Providers**: Mix local models with APIs from OpenAI, Anthropic, Gemini, Replicate, and more.
- **One-Click Deployment**: Scale from local dev to serverless GPUs with `nodetool deploy`.
- **Asset Management**: Built-in manager for all your media files.

## Use Cases

- **Smart Assistants**: Chat with local documents.
- **Agentic Workflows**: Search, classify, and automate.
- **Content Creation**: Generate text, images, video, and music.
- **Data Analysis**: Process data and extract insights.

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
