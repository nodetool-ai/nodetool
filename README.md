# NodeTool: Visual AI Workflow Builder

![Release](https://github.com/nodetool-ai/nodetool/actions/workflows/release.yaml/badge.svg)
[![Lint and Test](https://github.com/nodetool-ai/nodetool/actions/workflows/test.yml/badge.svg)](https://github.com/nodetool-ai/nodetool/actions/workflows/test.yml)
[![E2E Tests](https://github.com/nodetool-ai/nodetool/actions/workflows/e2e.yml/badge.svg)](https://github.com/nodetool-ai/nodetool/actions/workflows/e2e.yml)
![CodeQL](https://github.com/nodetool-ai/nodetool/actions/workflows/github-code-scanning/codeql/badge.svg)

[![Stars](https://img.shields.io/github/stars/nodetool-ai/nodetool?style=social)](https://github.com/nodetool-ai/nodetool/stargazers)
[![Downloads](https://img.shields.io/github/downloads/nodetool-ai/nodetool/total?color=3fb950)](https://github.com/nodetool-ai/nodetool/releases)
[![Latest Release](https://img.shields.io/github/v/release/nodetool-ai/nodetool?display_name=tag&sort=semver)](https://github.com/nodetool-ai/nodetool/releases/latest)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fnodetool.ai)](https://nodetool.ai)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/WmQTWZRcYE)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE.txt)

**Build AI Workflows Visually. Run Them Anywhere.**

NodeTool is an open-source visual workflow builder. Connect nodes to generate images, analyze documents, automate tasks, and process data—no coding required. Run models locally or via cloud APIs.

![Screenshot](screenshot.png)

## Features

- **Visual Editor**: Drag-and-drop node connections. No coding required.
- **Local Execution**: Run models on your hardware for privacy. Or use cloud APIs.
- **Real-time Feedback**: See results stream as workflows execute.
- **Portable Workflows**: Same workflow runs locally, on RunPod, Cloud Run, or self-hosted servers.

## Capabilities

- **Multimodal Support**: Text, image, audio, and video processing.
- **Local Models**: Run Flux, SDXL, LLMs on Apple Silicon, NVIDIA GPUs, or CPU. Works offline.
- **HuggingFace Integration**: Access 500,000+ models from the Hub.
- **Cloud APIs**: Connect to OpenAI, Anthropic, Gemini, Replicate.
- **Deployment**: Deploy to RunPod, Cloud Run, or self-hosted infrastructure.
- **Asset Management**: Organize and access media files from workflows.

## Use Cases

- **Media Generation**: Generate and transform images, videos, and audio.
- **Document Processing**: Build RAG systems, extract text, query documents.
- **Data Analysis**: Transform data, create visualizations, generate reports.
- **Automation**: Build AI agents that plan and execute multi-step tasks.

## Get Started

| Platform | Download | What You Need |
| :--- | :--- | :--- |
| **Windows** | [Download Installer](https://nodetool.ai) | Nvidia GPU recommended, 20GB free space |
| **macOS** | [Download Installer](https://nodetool.ai) | M1+ Apple Silicon |
| **Linux** | [Download AppImage](https://nodetool.ai) | Nvidia GPU recommended |

**Hardware for Local AI:**

- **Apple Silicon**: 16GB+ RAM (text/audio), 24GB+ (image generation)
- **Windows/Linux**: 4GB+ VRAM (text/audio), 8GB+ (images), 12GB+ (video)
- **Cloud-Only**: No GPU required—use cloud AI services

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

______________________________________________________________________

## 📱 Personal AI Stack

NodeTool supports mobile access to self-hosted AI infrastructure. Run models on your own hardware and access them from anywhere via secure connection.

### Deployment Patterns

#### 🏠 **Local Stack**
```
[Mobile] → [VPN] → [Home Server] → [Local LLMs] + [Data]
```

#### 🏢 **Private Cloud**
```
[Mobile] → [VPN] → [VPC] → [Self-Hosted NodeTool] → [Private LLMs]
```

#### 🌐 **Hybrid**
```
[Mobile] → [VPN] → [Local Server] → [Local LLMs] + [Cloud APIs]
```

### Setup

1. Set up NodeTool Server on your machine or cloud instance
2. Configure VPN access (Tailscale, WireGuard, etc.)
3. Install the Mobile App (iOS/Android)
4. Connect to your server

See [Mobile App Guide](mobile/README.md) and [Self-Hosted Deployment](docs/self_hosted.md).

## Testing

```bash
# Unit tests
cd electron && npm test && npm run lint
cd web && npm test && npm run lint

# End-to-end tests (requires nodetool backend)
cd web && npm run test:e2e
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
