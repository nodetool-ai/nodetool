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

NodeTool is an open-source visual workflow builder for everyone. Connect AI building blocks to generate images, analyze documents, automate tasks, and process data—all without coding. Run powerful models locally or in the cloud. Your workflows, your data, your control.

![Screenshot](screenshot.png)

## Why Choose NodeTool

- **Build Visually**: Create workflows like connecting building blocks. Drag, drop, and see results instantly. No coding required, but full flexibility when you need it.
- **Your Data, Your Rules**: Run AI models on your machine for complete privacy, or use cloud services when you want. You're always in control of where your data goes.
- **See Every Step**: Watch your workflows execute in real-time. Every action is visible—understand what's happening, tweak as you go, perfect your results.
- **Run Anywhere**: Design on your laptop, deploy to the cloud. Same workflow works on RunPod, Cloud Run, or your own servers. True portability.

## Powerful Features

- **Visual Workflow Canvas**: Drag-and-drop interface for building AI pipelines. Real-time execution, multimodal support (text, image, audio, video). Watch results stream as they generate.
- **Run Models Locally**: Access cutting-edge models (Flux, SDXL, LLMs) on Apple Silicon, NVIDIA GPUs, or CPU. No subscription fees. Works offline.
- **500,000+ Models**: Browse and use any model from HuggingFace Hub. From image generation to data analysis—your toolkit is vast.
- **Flexible Deployment**: Mix local models with cloud APIs (OpenAI, Anthropic, Gemini, Replicate). Use the right tool for each task.
- **One-Click Deployment**: Deploy workflows to RunPod, Cloud Run, or self-hosted infrastructure. Same workflow, any environment.
- **Built-in Asset Management**: Organize images, audio, videos, and documents. Access from any workflow node.

## What You Can Build

- **Creative Content**: Generate images, videos, and music. Transform media with AI. Build multi-stage creative pipelines.
- **Document Intelligence**: Chat with documents, build RAG systems, extract insights. Keep your data private with local processing.
- **Data Analysis**: Transform data with AI, create visualizations, automate reports. Build data processing pipelines.
- **Smart Automation**: Create AI agents that plan and execute tasks. Automate workflows, integrate with tools, save time.

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

## 📱 Your Personal AI Stack

**The future of AI isn't in the cloud. It's in your pocket, connected to your own infrastructure.**

NodeTool enables a revolutionary personal AI architecture: your mobile device becomes a window into your own AI-powered world—running on hardware you control, accessing data you own, with privacy guaranteed by design.

### The Vision: AI Without Compromise

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        YOUR PERSONAL AI STACK                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   📱 Mobile App                                                         │
│       │                                                                 │
│       │ (Secure Connection)                                             │
│       ▼                                                                 │
│   🔒 VPN / Tailscale / WireGuard                                        │
│       │                                                                 │
│       │ (Encrypted Tunnel)                                              │
│       ▼                                                                 │
│   🖥️  NodeTool Server (Your Hardware)                                   │
│       │                                                                 │
│       ├──────────────────┬──────────────────┐                          │
│       ▼                  ▼                  ▼                          │
│   🧠 Local LLMs      📁 Personal Data    🎨 Creative Tools             │
│   (Llama, Flux)      (Documents, Photos)  (Audio, Video)               │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why This Changes Everything

| Traditional Cloud AI | Your Personal AI Stack |
| :--- | :--- |
| Your data on someone else's servers | Your data stays on your hardware |
| Monthly subscriptions, usage fees | One-time hardware investment |
| Limited by API rate limits | Unlimited local inference |
| Internet required | Works on your LAN, offline-capable |
| Privacy policies you can't verify | Privacy you can mathematically prove |
| Vendor lock-in | Full portability and control |

### Deployment Architectures

NodeTool supports multiple deployment patterns to fit your needs:

#### 🏠 **Fully Local Stack** (Maximum Privacy)
```
[Mobile] → [VPN] → [Home Server] → [Local LLMs] + [Personal Data]
```
*Perfect for: Privacy-conscious individuals, sensitive work, offline environments*

#### ☁️ **NodeTool Cloud** (Zero Configuration)
```
[Mobile] → [NodeTool Cloud] → [Managed LLMs] + [Encrypted Storage]
```
*Perfect for: Quick start, no hardware management, team collaboration*

#### 🏢 **Private Cloud** (Enterprise Control)
```
[Mobile] → [VPN] → [Your Cloud VPC] → [Self-Hosted NodeTool] → [Private LLMs]
```
*Perfect for: Enterprises, compliance requirements, multi-user deployments*

#### 🌐 **Hybrid Stack** (Best of Both Worlds)
```
[Mobile] → [VPN] → [Local Server] → [Local LLMs] + [Cloud APIs when needed]
```
*Perfect for: Flexibility—use local for privacy, cloud for cutting-edge models*

### Getting Started with Your Personal Stack

1. **Set up NodeTool Server** on your home machine or cloud instance
2. **Configure secure access** via Tailscale, WireGuard, or your preferred VPN
3. **Install the Mobile App** on iOS or Android
4. **Connect** and access your AI workflows from anywhere in the world

**Your AI. Your data. Your rules.**

See the [Mobile App Guide](mobile/README.md) and [Self-Hosted Deployment](docs/self_hosted.md) for detailed setup instructions.

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
