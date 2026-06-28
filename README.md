# NodeTool

**The open creative AI workspace.**

*Every model. Your keys. Your canvas.*

[![Stars](https://img.shields.io/github/stars/nodetool-ai/nodetool?style=social)](https://github.com/nodetool-ai/nodetool/stargazers)
[![Downloads](https://img.shields.io/github/downloads/nodetool-ai/nodetool/total?color=3fb950)](https://github.com/nodetool-ai/nodetool/releases)
[![Latest Release](https://img.shields.io/github/v/release/nodetool-ai/nodetool?display_name=tag&sort=semver)](https://github.com/nodetool-ai/nodetool/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/WmQTWZRcYE)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE.txt)

[![Platform: macOS](https://img.shields.io/badge/platform-macOS-lightgrey)](https://nodetool.ai)
[![Platform: Windows](https://img.shields.io/badge/platform-Windows-blue)](https://nodetool.ai)
[![Platform: Linux](https://img.shields.io/badge/platform-Linux-orange)](https://nodetool.ai)

NodeTool is an open-source creative AI suite that runs entirely on your local machine. It combines a node-based canvas, a multi-track video timeline, and a layered sketch editor into a unified workspace. Wire every major AI model—cloud or local—directly into the professional production tools you already rely on.

* **Pay Provider Prices:** Plug in your own API keys and pay cloud providers directly at cost. 
* **Zero Lock-In:** Swap foundational models, media APIs, or local LLMs across text, image, video, and audio whenever you want.
* **Three Ways to Work:** Seamlessly fluid between node-based workflows, multi-track video generation, and layer-based painting and masking.

![NodeTool Interface](screen_canvas.png)

## Contents

- [Why NodeTool](#why-nodetool)
- [What's in the box](#whats-in-the-box)
- [Node editor](#node-editor)
- [Video editor](#video-editor)
- [Sketch editor](#sketch-editor)
- [How NodeTool compares](#how-nodetool-compares)
- [Get NodeTool](#get-nodetool)
- [Documentation](#documentation)
- [CLI & Server (npm)](#cli--server-npm)
- [Architecture](#architecture)
- [Development Setup](#development-setup)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Why NodeTool

Closed platforms lock you into their ecosystem. NodeTool is built for complete creative independence.

**Own your AI.**

*   **Independent Pricing:** Pay providers directly at cost with your own API keys, or run local models for free.
*   **Independent Data:** Workflows, keys, and files stay on your machine.
*   **Independent Software:** Open-source (AGPL-3.0).

> **Infrastructure Freedom:** If a provider raises prices or deprecates a model, just swap the backend node. Your creative workflow stays exactly the same.

## What's in the box

| | |
| :--- | :--- |
| **Node-based canvas** | Drag-and-drop nodes with type-safe connections |
| **Image, video, audio, text** | Unified workflows across every modality |
| **Editing tools as nodes** | Mask, inpaint, outpaint, relight, upscale, layers, compositing |
| **Video editor** | Multi-track timeline — sequence, composite, and AI-generate clips, then export to MP4 |
| **Sketch editor** | Layered paint canvas — draw, mask, and generate AI imagery onto layers, then feed the result downstream |
| **Runs on your machine** | Ollama, MLX (Apple Silicon), and GGUF for local inference |
| **BYOK everywhere** | OpenAI, Anthropic, Gemini, FAL, KIE, Replicate, ElevenLabs, HuggingFace |
| **Document search** | Built-in vector store for indexing and querying your files |
| **Real-time previews** | Live output at every node as the workflow runs |
| **Custom nodes** | Extend in TypeScript or Python |
| **Deploy & scale** | Self-host with Docker; rent GPU workers (RunPod, Vast) |
| **Cross-platform** | macOS, Windows, and Linux |

## Node editor

The node canvas lets you build visual workflows by chaining steps together—like loading an image, calling a model, and applying a mask.

*   **Fast creation:** Double-click to search and add nodes, or drag a connection into empty space to see compatible next steps.
*   **Type-safe routing:** Connector handles are color-coded. The editor prevents mistakes like wiring an image into a text field.
*   **Live previews:** Every node renders its output (images, video, text) in real time as the workflow executes.
*   **In-context editing:** Tweak properties directly on the node, group them to stay organized, or bypass a node to test a variation.
*   **Easy navigation:** Pan, zoom, use the minimap, or search by name to jump straight to any node in a large graph.

## Video editor

A generation-aware, multi-track timeline lives right next to the canvas. Drop in your own footage or bind a workflow to a clip — a text-to-image, image-to-video, or text-to-speech pipeline — and generate it in place. Change a parameter and the clip regenerates; tweak the bound workflow and the clip flags itself stale. Composite a live preview across video, audio, and overlay tracks, then export the whole sequence to MP4.

![NodeTool Video Editor](screen_video_editor.png)

See the [Video Editor guide](https://docs.nodetool.ai/video-editor) for the full tour.

## Sketch editor

A layered paint canvas built into the node graph. Draw and paint with real brushes, build up a composition in layers with blend modes and masks, then bind a layer to a model or one of your own workflows and generate image content right where you're painting. Change a prompt or an upstream input and the layer flags itself stale; regenerate in place and keep working on top. When you're done, the node hands the rest of your workflow a flattened image, a mask, and per-layer outputs — no export/import round-trip. It pairs naturally with the editing nodes (mask, inpaint, outpaint, compositing) for sketch-then-generate pipelines.

See the [Sketch Editor guide](https://docs.nodetool.ai/sketch-editor) for tools, layers, AI generation, and keyboard shortcuts.

## How NodeTool compares

| | NodeTool | ComfyUI | Weavy | n8n |
| :--- | :--- | :--- | :--- | :--- |
| **Built for** | Creatives working with AI | Stable Diffusion power users | Creative teams (now part of Figma) | Business workflows |
| **Modalities** | Image, video, audio, text | Image, video | Image, video | Text |
| **Models** | Every major provider, BYOK | Stable Diffusion | Curated marketplace | API integrations |
| **Source & pricing** | AGPL-3.0, provider prices | Open source, free | Closed, credits | Fair-code, subscription |

**vs ComfyUI.** ComfyUI exposes every parameter for engineers who want them. NodeTool keeps the node-based power, gives it an interface that doesn't fight you, and covers the rest of the stack — video, audio, text, document search.

**vs Weavy.** Weavy was the closed-source canvas for creative AI. After the Figma acquisition, the roadmap belongs to someone else. NodeTool is the open alternative — same node-based canvas, your keys, your files, no acquisition risk.

**vs n8n.** n8n is for business workflows and API plumbing. NodeTool is built for creative work — models, masks, layers, video, audio, RAG.

## Get NodeTool

Download the desktop app, install, and start building — runs fully on your machine.

| Platform | Get It | Requirements |
| :--- | :--- | :--- |
| **Windows** | [Download](https://nodetool.ai/studio) | NVIDIA GPU recommended, 4GB+ VRAM (local models), 20GB space |
| **macOS** | [Download](https://nodetool.ai/studio) | M1+ Apple Silicon, 16GB+ RAM (local models) |
| **Linux** | [Download](https://nodetool.ai/studio) | NVIDIA GPU recommended, 4GB+ VRAM (local models) |

[Flatpak CI Builds](https://github.com/nodetool-ai/nodetool/actions/workflows/flatpak-ci.yml) are available for Linux.

______________________________________________________________________

## Documentation

- **[Getting Started](https://docs.nodetool.ai/getting-started)** — Build your first workflow
- **[Video Editor](https://docs.nodetool.ai/video-editor)** — Sequence and AI-generate clips on a timeline
- **[Sketch Editor](https://docs.nodetool.ai/sketch-editor)** — Draw, mask, and AI-generate on a layered canvas
- **[Node Packs](https://docs.nodetool.ai/packs)** — Available nodes and integrations
- **[Custom Nodes](https://docs.nodetool.ai/developer/custom-nodes-guide)** — Extend NodeTool
- **[Provider Guides](https://docs.nodetool.ai/developer/providers/)** — Add new models & nodes for any provider
- **[Deployment](https://docs.nodetool.ai/deployment)** — Share your work
- **[API Reference](https://docs.nodetool.ai/api)** — Programmatic access

______________________________________________________________________

## CLI & Server (npm)

Run the server, execute workflows, or chat from the terminal:

```bash
# Install globally (Node.js 22.x required)
npm install -g @nodetool-ai/cli

# Start the API server (port 7777)
nodetool serve

# Interactive chat with agent mode
nodetool-chat --agent --provider anthropic --model claude-sonnet-4-6

# Run a TypeScript DSL workflow
nodetool workflows run my-workflow.ts

# One-off without global install
npx --package=@nodetool-ai/cli nodetool serve
npx --package=@nodetool-ai/cli nodetool-chat --agent
```

See the [CLI Reference](https://docs.nodetool.ai/cli) for all commands.

______________________________________________________________________

## Architecture

NodeTool is a monorepo with a TypeScript backend, React frontend, Electron desktop shell, and React Native mobile app.

```
nodetool/
├── packages/          # Backend monorepo (55 packages)
│   ├── kernel/        #   Workflow graph & runner
│   ├── node-sdk/      #   BaseNode class & node registry
│   ├── base-nodes/    #   100+ built-in node types
│   ├── agents/        #   Agent system with task planning & tools
│   ├── runtime/       #   Processing context & model providers
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

**Prerequisites:** Node.js 22.22.1, npm. Python 3.11 with conda for Python nodes (optional).

> **Node 22.22.1 is required.** Matches Electron 39's embedded Node so dev and the packaged app run on the same Node version. Use `nvm use` to activate (reads `.nvmrc`).

### Quick Start

```bash
nvm use                    # Activate Node 22.22.1 (reads .nvmrc)
npm install
npm run build:packages     # Build all TS packages in dependency order

# Run backend (port 7777) and frontend (port 3000)
# Uses tsx --watch for the backend, so startup skips a full websocket package rebuild.
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

> **Native module ABI caveat.** Electron 39 bundles its own Node.js (22.22.1) but uses a distinct `NODE_MODULE_VERSION` (140), so native modules like `better-sqlite3` must be compiled against Electron's headers — *not* system Node, even when the major matches. This is handled automatically by `@electron/rebuild`, wired into `electron/`'s `postinstall`. If you ever see a `NODE_MODULE_VERSION` mismatch, force a rebuild:
>
> ```bash
> npm --prefix electron run postinstall
> ```
>
> **Do not** use plain `npm rebuild` — it compiles against system Node's ABI, which will not match Electron's runtime.

### Mobile App

```bash
cd mobile && npm install && npm start
```

See [mobile/README.md](mobile/README.md) for full setup.

### Common Commands

| Command | Description |
| :--- | :--- |
| `npm install` | Install all dependencies |
| `npm run build` | Build all packages + web |
| `npm run dev` | Start backend (`tsx --watch`) + web dev server |
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

We welcome bug reports, feature requests, code contributions, and new nodes.

Please open an issue before starting major work so we can coordinate.

### Acknowledgements

- [@mphermes](https://github.com/mphermes) — Atlas Cloud integration

## License

[AGPL-3.0](https://github.com/nodetool-ai/nodetool/blob/main/LICENSE.txt)

## Get in Touch

- **General**: [hello@nodetool.ai](mailto:hello@nodetool.ai)
- **Team**: [matti@nodetool.ai](mailto:matti@nodetool.ai), [david@nodetool.ai](mailto:david@nodetool.ai)

[GitHub](https://github.com/nodetool-ai/nodetool) | [Discord](https://discord.gg/WmQTWZRcYE) | [Website](https://nodetool.ai)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nodetool-ai/nodetool&type=date&legend=top-left)](https://www.star-history.com/#nodetool-ai/nodetool&type=date&legend=top-left)
