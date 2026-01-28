# NodeTool: Visual AI Workflow Builder

[![Stars](https://img.shields.io/github/stars/nodetool-ai/nodetool?style=social)](https://github.com/nodetool-ai/nodetool/stargazers)
[![Downloads](https://img.shields.io/github/downloads/nodetool-ai/nodetool/total?color=3fb950)](https://github.com/nodetool-ai/nodetool/releases)
[![Latest Release](https://img.shields.io/github/v/release/nodetool-ai/nodetool?display_name=tag&sort=semver)](https://github.com/nodetool-ai/nodetool/releases/latest)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fnodetool.ai)](https://nodetool.ai)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/WmQTWZRcYE)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE.txt)

**Build AI workflows visually. Run them anywhere.**

NodeTool is open-source software for creating AI workflows without code. Drag and drop nodes to generate images, process documents, analyze data, and automate tasks. Run models on your machine or use cloud APIs.

![Screenshot](screen2.png)

## Why NodeTool

- **Visual editing**: Connect nodes by dragging lines between them
- **Run anywhere**: Your laptop, a server, or the cloud
- **Private by default**: Models run on your hardware unless you choose otherwise
- **See it happen**: Watch results appear as your workflow runs

## What You Can Do

- Work with text, images, audio, and video
- Run models locally on Apple Silicon, NVIDIA GPUs, or CPU (works offline)
- Access 500,000+ models from HuggingFace
- Use cloud APIs: OpenAI, Anthropic, Gemini, OpenRouter, Kie, Fal, MiniMax, Replicate
- Deploy to RunPod, Google Cloud Run, or your own infrastructure
- Manage and organize your media files

## Common Uses

- Generate and edit images, videos, and audio
- Build RAG systems, extract text, search documents
- Transform data, create charts, generate reports
- Create AI agents that plan and execute tasks

## Cloud Models

Access the latest AI models through simple nodes:

**Video**: OpenAI Sora 2 Pro, Google Veo 3.1, xAI Grok Imagine, Alibaba Wan 2.6, MiniMax Hailuo 2.3, Kling 2.6

**Image & Audio**: Black Forest Labs FLUX.2, Google Nano Banana Pro

Use `TextToVideo`, `ImageToVideo`, or `TextToImage` nodes and select your provider and model.

> Some models need direct API keys. Others work through [kie.ai](https://kie.ai/), which combines multiple providers and often has better prices.

## Download

| Platform | Get It | Requirements |
| :--- | :--- | :--- |
| **Windows** | [Download](https://nodetool.ai) | NVIDIA GPU recommended, 20GB space |
| **macOS** | [Download](https://nodetool.ai) | M1+ Apple Silicon |
| **Linux** | [Download](https://nodetool.ai) | NVIDIA GPU recommended |

**Running AI locally needs:**

- **Apple Silicon**: 16GB+ RAM for text/audio, 24GB+ for images
- **Windows/Linux**: 4GB+ VRAM for text/audio, 8GB+ for images, 12GB+ for video
- **Cloud only**: No GPU needed—just use API services

______________________________________________________________________

## Documentation

- **[Getting Started](https://docs.nodetool.ai/getting-started)** - Build your first workflow
- **[Node Packs](https://docs.nodetool.ai/packs)** - Available operations and integrations
- **[Custom Nodes](https://docs.nodetool.ai/development/custom-nodes)** - Extend NodeTool
- **[Deployment](https://docs.nodetool.ai/deployment)** - Share your work
- **[API Reference](https://docs.nodetool.ai/api)** - Programmatic access

______________________________________________________________________

## Development Setup

For core library work, see [nodetool-core](https://github.com/nodetool-ai/nodetool-core).

**Prerequisites:** Python 3.11, Conda, Node.js LTS

**Quick start:**

```bash
# Setup
conda env update -f environment.yml --prune
conda activate nodetool

# Install
uv pip install git+https://github.com/nodetool-ai/nodetool-core git+https://github.com/nodetool-ai/nodetool-base

# Run
nodetool serve --reload &
cd web && npm install && npm start
```

### HuggingFace Pack (Linux/Windows GPU)

Requires CUDA driver ≥525.60.13 (Linux) or ≥527.41 (Windows):

```bash
uv pip install git+https://github.com/nodetool-ai/nodetool-huggingface --extra-index-url https://download.pytorch.org/whl/cu128
```

### MLX Pack (Apple Silicon)

```bash
uv pip install git+https://github.com/nodetool-ai/nodetool-mlx
```

### Electron App

Set your Conda path in `settings.yaml` and run `make electron`.

### Mobile App

Run Mini Apps on iOS and Android:

```bash
cd mobile && npm install && npm start
```

See [mobile/README.md](mobile/README.md) for setup.

______________________________________________________________________

## Personal AI Stack

Run NodeTool on your hardware and access it from mobile devices via secure connection.

**Deployment options:**

🏠 **Local**: Mobile → VPN → Home Server → Local models + data

🏢 **Private Cloud**: Mobile → VPN → VPC → Self-hosted NodeTool → Private models

🌐 **Hybrid**: Mobile → VPN → Local Server → Local models + Cloud APIs

**Setup:**
1. Install NodeTool on your machine or cloud
2. Set up VPN (Tailscale, WireGuard, etc.)
3. Install mobile app
4. Connect to your server

See [Mobile App Guide](mobile/README.md) and [Self-Hosted Deployment](docs/self_hosted.md).

## Testing

```bash
# Unit tests
cd electron && npm test && npm run lint
cd web && npm test && npm run lint

# End-to-end (needs backend)
cd web && npm run test:e2e
```

## Contributing

We welcome:
- Bug reports and feature requests
- Code contributions
- New node creation

Open an issue before starting major work.

## License

[AGPL-3.0 license](https://github.com/nodetool-ai/nodetool/blob/main/LICENSE).

## Get in Touch

- **General**: [hello@nodetool.ai](mailto:hello@nodetool.ai)
- **Team**: [matti@nodetool.ai](mailto:matti@nodetool.ai), [david@nodetool.ai](mailto:david@nodetool.ai)

[GitHub](https://github.com/nodetool-ai/nodetool) • [Discord](https://discord.gg/WmQTWZRcYE)
