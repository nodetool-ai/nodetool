# NodeTool: Your Visual AI Creative Studio

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

**Create, Connect, Generate. Your AI Creative Playground.**

NodeTool is your visual canvas for building AI-powered creative workflows. Connect ideas like building blocks—generate images, transform videos, create music, and bring your imagination to life. No coding required. Your creations, your data, your way.

![Screenshot](screenshot.png)

## Why Creators Love NodeTool

- **Your Creative Playground**: Build visual workflows like connecting LEGO blocks. Experiment freely—drag, drop, and see results instantly. No coding, no limits.
- **Privacy That Empowers**: Keep your creative work private. Run AI models on your own machine, or choose cloud services when you need them. You're always in control.
- **See Your Ideas Flow**: Watch your creations come to life in real-time. Every step is visible—understand what's happening, tweak as you go, perfect your craft.
- **Create Anywhere**: Design on your laptop, run on the cloud, share with your team. Same creative workflow, any environment. Freedom to work your way.

## Creative Superpowers

- **Visual Canvas**: Drag-and-drop creative workflows. Connect AI building blocks like arranging layers in Photoshop. Watch your ideas generate in real-time.
- **Unlimited AI Models**: Access cutting-edge models (Flux, SDXL, Stable Diffusion) running on your Mac, PC, or GPU. No subscription fees. Create offline.
- **500,000+ Creative Tools**: Browse and use any model from HuggingFace Hub. From image generation to music creation—your palette is endless.
- **Mix & Match Freely**: Combine local AI with cloud services (OpenAI, Anthropic, Gemini, Replicate). Use the perfect tool for each creative task.
- **Share Your Magic**: Deploy your creative workflows with one click. Turn them into apps your team or clients can use. Same workflow, anywhere.
- **Your Media Library**: Built-in asset manager keeps your images, audio, and videos organized. Access from any creative node.

## What You Can Create

- **AI Art & Design**: Generate stunning visuals, create variations, remix styles. Chain image models into creative pipelines that would take hours in traditional tools.
- **Video Magic**: Edit, enhance, and transform videos with AI. Add effects, generate animations, create content that stands out.
- **Audio & Music**: Transcribe, generate, and transform audio. Create soundscapes, narrations, and music with AI assistance.
- **Smart Content Tools**: Build intelligent assistants that understand your creative brief. Generate ideas, variations, and content at the speed of thought.

## Get Started in Minutes

| Platform | Download | Best For |
| :--- | :--- | :--- |
| **Windows** | [Download Installer](https://nodetool.ai) | Nvidia GPU for AI art & video (20GB free space) |
| **macOS** | [Download Installer](https://nodetool.ai) | M1+ Apple Silicon for creative workflows |
| **Linux** | [Download AppImage](https://nodetool.ai) | Nvidia GPU for maximum creative power |

**What You'll Need for Local AI:**

- **Apple Silicon Mac**: 16GB+ RAM for images & text, 24GB+ for advanced image generation
- **Windows/Linux PC**: 4GB+ VRAM for basics, 8GB+ for images, 12GB+ for video generation
- **Cloud Creator**: No GPU needed—use cloud AI services instead

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
