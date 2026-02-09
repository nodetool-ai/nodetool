# NodeTool: Visual Builder for AI Workflows and Agents

[![Stars](https://img.shields.io/github/stars/nodetool-ai/nodetool?style=social)](https://github.com/nodetool-ai/nodetool/stargazers)
[![Downloads](https://img.shields.io/github/downloads/nodetool-ai/nodetool/total?color=3fb950)](https://github.com/nodetool-ai/nodetool/releases)
[![Latest Release](https://img.shields.io/github/v/release/nodetool-ai/nodetool?display_name=tag&sort=semver)](https://github.com/nodetool-ai/nodetool/releases/latest)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fnodetool.ai)](https://nodetool.ai)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/WmQTWZRcYE)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE.txt)

[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)](https://nodetool.ai)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows-blue)](https://nodetool.ai)
[![Platform: Linux](https://img.shields.io/badge/platform-Linux-orange)](https://nodetool.ai)

NodeTool is an open-source visual programming tool for building AI workflows. Connect LLMs, real-time systems, build AI agents and generate media through a drag-and-drop node interface.

![Screenshot](screen2.png)

## Why NodeTool

- **Node-based visual interface**: Connect nodes by dragging lines between them for AI workflow orchestration
- **Run anywhere**: Your laptop, a server, or the cloud - local execution engine for macOS, Windows, and Linux
- **Local-first AI**: Run models entirely on your machine with support for local LLMs via Ollama, MLX, and GGML/GGUF formats
- **Streaming**: Real-time workflow execution with async data streams
- **Build AI agents**: Create LLM agents with tool use and secure code execution
- **Type-safe connections**: Ensure compatibility between node inputs and outputs

## What You Can Do

- **Multimodal AI**: Process text, images, video, and audio
- **Run locally**: Apple Silicon (M1+), NVIDIA GPUs, or CPU (works offline)
- **Access models**: 500,000+ models from HuggingFace
- **Cloud APIs**: OpenAI, Anthropic, Gemini, OpenRouter, Kie, Fal, MiniMax, Replicate
- **Secure Code execution**: Execute code in secure containers
- **Build RAG systems**: Vector database integration for semantic search
- **Deploy anywhere**: Docker, RunPod, Google Cloud Run
- **Extend with Python**: Build custom nodes

**Common applications**: LLM agents with tool use, creative pipelines, RAG systems, generative media, document processing, and data transformation.

## How NodeTool Compares

**vs ComfyUI**: While ComfyUI focuses on media generation workflows, NodeTool extends the node-based concept to general AI workflows including LLM agents, real-time streaming and RAG systems.

**vs n8n**: While n8n is a general workflow automation tool for business processes and API integrations, NodeTool is specialized for AI workloads with native support for model management, local LLMs, multimodal, RAG and secure code execution.

## Cloud Models

Access the latest AI models through simple nodes:

**Video**: OpenAI Sora 2 Pro, Google Veo 3.1, xAI Grok Imagine, Alibaba Wan 2.6, MiniMax Hailuo 2.3, Kling 2.6

**Image & Audio**: Black Forest Labs FLUX.2, Google Nano Banana Pro

Use `TextToVideo`, `ImageToVideo`, or `TextToImage` nodes and select your provider and model.

> Some models need direct API keys. Others work through [kie.ai](https://kie.ai/), which combines multiple providers and often has better prices.

## Download

| Platform | Get It | Requirements |
| :--- | :--- | :--- |
| **Windows** | [Download](https://nodetool.ai) | NVIDIA GPU recommended, 4GB+ VRAM (local AI), 20GB space |
| **macOS** | [Download](https://nodetool.ai) | M1+ Apple Silicon, 16GB+ RAM (local AI) |
| **Linux** | [Download](https://nodetool.ai) • [Flatpak CI Builds](https://github.com/nodetool-ai/nodetool/actions/workflows/flatpak-ci.yml) | NVIDIA GPU recommended, 4GB+ VRAM (local AI) |

*Cloud-only usage requires no GPU—just use API services.*

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

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nodetool-ai/nodetool&type=date&legend=top-left)](https://www.star-history.com/#nodetool-ai/nodetool&type=date&legend=top-left)
