# NodeTool: Visual Builder for AI Workflows and Agents

[![Stars](https://img.shields.io/github/stars/nodetool-ai/nodetool?style=social)](https://github.com/nodetool-ai/nodetool/stargazers)
[![Downloads](https://img.shields.io/github/downloads/nodetool-ai/nodetool/total?color=3fb950)](https://github.com/nodetool-ai/nodetool/releases)
[![Latest Release](https://img.shields.io/github/v/release/nodetool-ai/nodetool?display_name=tag&sort=semver)](https://github.com/nodetool-ai/nodetool/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/WmQTWZRcYE)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE.txt)

[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)](https://nodetool.ai)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows-blue)](https://nodetool.ai)
[![Platform: Linux](https://img.shields.io/badge/platform-Linux-orange)](https://nodetool.ai)

> AI belongs on your machine, next to your data. Not behind a paywall. Not in someone else's cloud.

NodeTool is an open-source visual platform for building AI workflows. Connect LLMs, generate media, build agents, and process data through a drag-and-drop node interface — locally or in the cloud.

![NodeTool Interface](screen3.png)

## Key Features

| | |
| :--- | :--- |
| **Visual workflow builder** | Drag-and-drop nodes with type-safe connections — no code required |
| **Local-first AI** | Run models on your machine via Ollama, MLX (Apple Silicon), and GGUF/GGML |
| **500,000+ models** | Access HuggingFace's full model library for any ML task |
| **Cloud APIs** | OpenAI, Anthropic, Gemini, Replicate, Fal, MiniMax, Kie, OpenRouter |
| **AI agents** | Build LLM agents with 100+ built-in tools and secure code execution |
| **Multimodal** | Process and generate text, images, video, and audio in one workflow |
| **Real-time streaming** | Async execution with live output previews |
| **Deploy anywhere** | Docker, RunPod, Google Cloud Run, or self-hosted |
| **Extend with code** | Build custom nodes in Python or TypeScript |
| **Cross-platform** | Desktop (Electron), web, CLI, and mobile (React Native) |

## What You Can Build

- **LLM agents** with tool use, planning, and multi-step reasoning
- **Creative pipelines** for image, video, and audio generation
- **RAG systems** with vector search and document processing
- **Data transformation** workflows with batch processing
- **Mini-Apps** — share workflows as interactive web applications
- **Automation** pipelines combining local AI with cloud services

## Cloud Models

Access the latest generative AI models through simple nodes:

| Type | Models |
| :--- | :--- |
| **Video** | OpenAI Sora 2 Pro, Google Veo 3.1, xAI Grok Imagine, Alibaba Wan 2.6, MiniMax Hailuo 2.3, Kling 2.6 |
| **Image** | Black Forest Labs FLUX.2, Google Nano Banana Pro, DALL-E 3 |
| **Audio** | OpenAI Whisper, OpenAI TTS, ElevenLabs |
| **Text** | GPT-4, Claude, Gemini, Llama, Mistral (local or cloud) |

Use `TextToVideo`, `ImageToVideo`, or `TextToImage` nodes and select your provider and model.

> Some models need direct API keys. Others work through [kie.ai](https://kie.ai/), which combines multiple providers and often has better prices.

## How NodeTool Compares

| | NodeTool | ComfyUI | n8n |
| :--- | :--- | :--- | :--- |
| **Focus** | General AI workflows + agents | Media generation | Business automation |
| **Local LLMs** | Ollama, MLX, GGUF | Limited | No |
| **AI Agents** | Built-in with 100+ tools | No | Basic |
| **RAG / Vector DB** | Native support | No | Via plugins |
| **Streaming** | Real-time async | Queue-based | Webhook-based |
| **Multimodal** | Text, image, video, audio | Image, video | Text-focused |
| **Code execution** | Sandboxed (Docker) | No | Limited |

## Download

| Platform | Get It | Requirements |
| :--- | :--- | :--- |
| **Windows** | [Download](https://nodetool.ai) | NVIDIA GPU recommended, 4GB+ VRAM (local AI), 20GB space |
| **macOS** | [Download](https://nodetool.ai) | M1+ Apple Silicon, 16GB+ RAM (local AI) |
| **Linux** | [Download](https://nodetool.ai) | NVIDIA GPU recommended, 4GB+ VRAM (local AI) |

[Flatpak CI Builds](https://github.com/nodetool-ai/nodetool/actions/workflows/flatpak-ci.yml) are also available for Linux.

*Cloud-only usage requires no GPU — just use API services.*

______________________________________________________________________

## Documentation

- **[Getting Started](https://docs.nodetool.ai/getting-started)** — Build your first workflow
- **[Node Packs](https://docs.nodetool.ai/packs)** — Available operations and integrations
- **[Custom Nodes](https://docs.nodetool.ai/developer/custom-nodes-guide)** — Extend NodeTool
- **[Deployment](https://docs.nodetool.ai/deployment)** — Share your work
- **[API Reference](https://docs.nodetool.ai/api)** — Programmatic access

______________________________________________________________________

## Architecture

NodeTool is a monorepo with a TypeScript backend, React frontend, Electron desktop shell, and React Native mobile app.

```
nodetool/
├── packages/          # Backend monorepo (28 packages)
│   ├── kernel/        #   DAG orchestration & workflow runner
│   ├── node-sdk/      #   BaseNode class & node registry
│   ├── base-nodes/    #   100+ built-in node types
│   ├── agents/        #   Agent system with task planning & tools
│   ├── runtime/       #   Processing context & LLM providers
│   ├── websocket/     #   HTTP + WebSocket server (entry point)
│   ├── vectorstore/   #   SQLite-vec vector database
│   ├── code-runners/  #   Sandboxed code execution
│   └── ...            #   Protocol, config, auth, storage, deploy, etc.
├── web/               # React frontend (Vite + MUI + React Flow)
├── electron/          # Electron desktop app
├── mobile/            # React Native mobile app (Expo)
└── docs/              # Jekyll documentation site
```

For a detailed architecture overview, see [ARCHITECTURE.md](ARCHITECTURE.md).

______________________________________________________________________

## Development Setup

**Prerequisites:** Node.js 22.x (LTS), npm. Python 3.11 with conda for Python nodes (optional).

> **Node 22 is required.** Electron 35 embeds Node 22 — native modules must match. Use `nvm use` to activate the correct version (reads `.nvmrc`).

### Quick Start

```bash
nvm use                    # Activate Node 22 (reads .nvmrc)
npm install
npm run build:packages     # Build all TS packages in dependency order

# Run backend (port 7777) and frontend (port 3000)
npm run dev
```

### Python Nodes (optional)

Python nodes (HuggingFace, MLX, Apple integrations) run via the `PythonStdioBridge`, which spawns a Python worker process that communicates over stdin/stdout. The bridge connects lazily on the first workflow that uses Python nodes — no separate setup is needed for the TypeScript backend.

### Electron App

```bash
npm run electron
```

The Electron app auto-detects your active Conda environment. Settings are stored in:
- **Linux/macOS**: `~/.config/nodetool/settings.yaml`
- **Windows**: `%APPDATA%\nodetool\settings.yaml`

### Mobile App

```bash
cd mobile && npm install && npm start
```

See [mobile/README.md](mobile/README.md) for full setup.

### Make Commands

| Command | Description |
| :--- | :--- |
| `npm install` | Install all dependencies |
| `npm run build` | Build all packages + web |
| `npm run dev` | Start backend + web dev server |
| `npm run electron` | Build and start Electron app |
| `npm run check` | Run typecheck + lint + test |
| `npm run test` | Run all tests |

______________________________________________________________________

## Testing

```bash
# Unit tests
cd electron && npm test && npm run lint
cd web && npm test && npm run lint

# Web E2E (needs backend on port 7777)
cd web && npx playwright install chromium && npm run test:e2e

# Electron E2E (requires xvfb on Linux headless)
cd electron && npm run vite:build && npx tsc
cd electron && npx playwright install chromium && npm run test:e2e
```

For detailed testing documentation, see [web/TESTING.md](web/TESTING.md).

______________________________________________________________________

## Contributing

We welcome bug reports, feature requests, code contributions, and new node creation.

Please open an issue before starting major work so we can coordinate.

## License

[AGPL-3.0](https://github.com/nodetool-ai/nodetool/blob/main/LICENSE)

## Get in Touch

- **General**: [hello@nodetool.ai](mailto:hello@nodetool.ai)
- **Team**: [matti@nodetool.ai](mailto:matti@nodetool.ai), [david@nodetool.ai](mailto:david@nodetool.ai)

[GitHub](https://github.com/nodetool-ai/nodetool) | [Discord](https://discord.gg/WmQTWZRcYE) | [Website](https://nodetool.ai)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nodetool-ai/nodetool&type=date&legend=top-left)](https://www.star-history.com/#nodetool-ai/nodetool&type=date&legend=top-left)
