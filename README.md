# NodeTool: Visual AI Workflow Builder

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

NodeTool is an open-source visual programming environment for building, testing, and deploying AI workflows. Drag, drop, and connect powerful AI models running entirely on your machine or via cloud APIs. No API keys required for local models. No data leaves your device unless you choose to.

![Screenshot](screenshot.png)

## Core Principles

- **Local First**: Run workflows on your machine without relying on vendor cloud infrastructure.
- **Open Source**: Inspect, modify, and self-host the entire stack. AGPL-3.0 licensed.
- **Data Privacy**: Data is processed locally. No telemetry, tracking, or phoning home.
- **No Lock-In**: Portable workflow format that works from laptop to deployment.

## Features

### The Workflow Engine

Design logic visually with a typed node system.

- **Visual Canvas**: Drag-and-drop interface with type-safe connections and infinite undo.
- **Real-time Execution**: Watch the graph execute step-by-step. Preview outputs (images, text, audio) immediately.
- **Multimodal**: Process text, images, audio, and video in a single graph.
- **Built-in Memory**: Integrated ChromaDB for RAG workflows.
- **Observability**: Inspect every step as it runs. No black boxes.

### Universal Local Inference

Run state-of-the-art models natively on Apple Silicon and NVIDIA GPUs with zero latency.

- **MLX**: Optimized for Apple Silicon (M1-M4). Run LLMs, audio, and image generation natively on macOS.
- **llama.cpp**: Universal inference for GGUF models on CPU/GPU across any platform.
- **vLLM**: Production-grade serving with PagedAttention and continuous batching.
- **Nunchaku**: High-performance inference for Flux, Qwen, and SDXL.

### HuggingFace Native Integration

Access thousands of models directly.

- **Model Manager**: Search, download, and manage model weights directly from the Hub.
- **Broad Support**: From Transformers to Diffusers, download and run compatible models with a single click.

### Use Any Provider

Bring your own API keys. No markup, no middleman.

- **Supported Providers**: OpenAI, Anthropic, Gemini, Fal AI, Replicate, HuggingFace, and more.
- **Mix and Match**: Use different providers in one workflow. Swap models instantly.

### Deployment

Scale workflows from local development to serverless GPUs with one command.

- **One Command Deploy**: `nodetool deploy` pushes your workflow to the cloud.
- **Scale to Zero**: Pay only for active inference time. Endpoints automatically scale down when idle.
- **Providers**: Supports RunPod, Google Cloud, and others.

### Asset Management

- **Organize Everything**: Built-in Asset Manager for files.
- **Drag & Drop**: Import images, videos, documents, and audio.
- **Preview**: Built-in preview for all media types.

## Use Cases

- **Smart Assistants**: Build assistants that interact with your local documents and notes.
- **Agentic Workflows**: Create systems that search the web, classify emails, and use tools.
- **Content Generation**: Automate text-to-image, video generation, and music creation pipelines.
- **Data Analysis**: Process spreadsheets, generate charts, and extract insights.
- **Voice & Audio**: Transcribe, analyze, and generate speech.

## Quick Start

| Platform    | Download                                  | Requirements                            |
| ----------- | ----------------------------------------- | --------------------------------------- |
| **Windows** | [Download Installer](https://nodetool.ai) | Nvidia GPU recommended, 20GB free space |
| **macOS**   | [Download Installer](https://nodetool.ai) | M1+ Apple Silicon                       |
| **Linux**   | [Download AppImage](https://nodetool.ai)  | Nvidia GPU recommended                  |

### Hardware Requirements for Local Inference

| Setup             | Hardware              | Notes                                                     |
| ----------------- | --------------------- | --------------------------------------------------------- |
| **Apple Silicon** | M1/M2/M3/M4 Mac       | 16GB+ RAM for LLM/TTS, 24GB+ for image generation        |
| **Windows/Linux** | NVIDIA GPU with CUDA  | 4GB+ VRAM for LLM/TTS, 8GB+ for image, 12GB+ for video   |
| **Cloud Only**    | No GPU required       | Use API providers (OpenAI, Anthropic, Replicate, FAL)    |

______________________________________________________________________

## Documentation

- **[Getting Started](https://docs.nodetool.ai/getting-started)**
- **[Node Packs](https://docs.nodetool.ai/packs)**
- **[Custom Nodes](https://docs.nodetool.ai/development/custom-nodes)**
- **[Deployment](https://docs.nodetool.ai/deployment)**
- **[API Reference](https://docs.nodetool.ai/api)**

______________________________________________________________________

## 🛠️ Development Setup

Set up a local development environment for the entire NodeTool platform.

For core library development, see [nodetool-core repository](https://github.com/nodetool-ai/nodetool-core).

### Prerequisites

- Python 3.11
- Conda ([miniconda.org](https://docs.conda.io/en/latest/miniconda.html))
- Node.js LTS ([nodejs.org](https://nodejs.org/en))

### 1. Set Up Conda Environment

```bash
# Create or update the Conda environment from environment.yml
conda env update -f environment.yml --prune
conda activate nodetool
```

### 2. Install Core Python Dependencies

```bash
# Install core packages
uv pip install git+https://github.com/nodetool-ai/nodetool-core
uv pip install git+https://github.com/nodetool-ai/nodetool-base
```

**For development:**

```bash
git clone https://github.com/nodetool-ai/nodetool-core
cd nodetool-core
uv pip install -e .
cd ..

git clone https://github.com/nodetool-ai/nodetool-base
cd nodetool-base
uv pip install -e .
cd ..
```

### 3. Install Node Packs

For a list of available packs and installation instructions, see the [Node Packs documentation](https://docs.nodetool.ai/packs).

### 4. Run NodeTool Backend & Web UI

Activate the conda environment first.

**Option A: Development (Backend + Web UI)**

```bash
# Terminal 1: Start backend
nodetool serve --reload

# Terminal 2: Start frontend
cd web
npm install
npm start
```

Access at `http://localhost:3000`

**Option B: Desktop App (Electron)**

Configure conda path in `settings.yaml`:

- macOS/Linux: `~/.config/nodetool/settings.yaml`
- Windows: `%APPDATA%/nodetool/settings.yaml`

```yaml
CONDA_ENV: /path/to/your/conda/envs/nodetool
```

Build frontends (once or when code changes):

```bash
cd web && npm install && npm run build && cd ..
cd apps && npm install && npm run build && cd ..
cd electron && npm install && npm run build && cd ..
```

Start Electron:

```bash
cd electron
npm start
```

## Testing

### Python (core, packs)

```bash
pytest -q
```

### Web UI

```bash
cd web
npm test
npm run lint
npm run typecheck
```

### Electron

```bash
cd electron
npm run lint
npm run typecheck
```

## Code Quality

Pre-commit hooks check and format code before commits.

```bash
# Install pre-commit
conda activate nodetool
pip install pre-commit
pre-commit install

# Run manually
pre-commit run --all-files

# Skip if necessary (not recommended)
git commit --no-verify -m "Your message"
```

**Checks:**

- Python: Ruff linting/formatting
- TypeScript/JavaScript: ESLint, type checking
- General: trailing whitespace, YAML/JSON validation

## Troubleshooting

- **Node/npm versions**: Use Node.js LTS (≥18). Reset with `rm -rf node_modules && npm install`
- **Port in use**: Stop other processes on port 3000/8000 or change ports
- **CLI not found**: Activate conda environment and restart shell
- **GPU/PyTorch issues**: Use `--extra-index-url` when installing GPU-dependent packs

## Contributing

NodeTool is developed in the open, and we welcome contributions of all kinds:

- **Bug reports and feature requests** — Help us identify issues and prioritize improvements
- **Code contributions** — Fix bugs, add features, or improve performance
- **Documentation** — Clarify instructions, add examples, or fix typos
- **Node development** — Create new nodes to extend NodeTool's capabilities
- **Workflow sharing** — Share interesting workflows with the community

**Pull requests are welcome!** For major changes, please open an issue first to discuss your ideas.

### Development workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/name`)
3. Commit changes (`git commit -m 'Add feature'`)
4. Push to branch (`git push origin feature/name`)
5. Open a Pull Request

## License

NodeTool is free and open source software, released under the [AGPL-3.0 license](https://github.com/nodetool-ai/nodetool/blob/main/LICENSE).

## Get in Touch

Questions, bug reports, feature requests. We're here to help.

### General Inquiries

Say hi or tell us what you need.
[hello@nodetool.ai](mailto:hello@nodetool.ai)

### The Team

Direct contact to the developers.

- **Matthias**: [matti@nodetool.ai](mailto:matti@nodetool.ai)
- **David**: [david@nodetool.ai](mailto:david@nodetool.ai)

Built with ❤️ by the NodeTool team.

[GitHub](https://github.com/nodetool-ai/nodetool) • [Discord](https://discord.gg/WmQTWZRcYE)
