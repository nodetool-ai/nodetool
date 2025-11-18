# NodeTool - Documentation

## What is NodeTool?

NodeTool is a local-first visual environment for building and running AI workflows.
It combines a node-based editor, a powerful chat assistant, asset management,
local + cloud model integration, and real-time execution through WebSockets.

NodeTool is an open‑source, local‑first platform for building AI agents and workflows visually. Design, run, and deploy
powerful AI systems using drag‑and‑drop nodes that connect models, tools, data, and your everyday apps.

> Build agents visually • Deploy anywhere • Privacy by design

## How It Works

1. 🏗️ Build — Create workflows by dragging and connecting nodes.
1. ⚡ Run — Test locally; your data stays on your machine by default.
1. 🚀 Deploy — Ship to your own cloud or provider when ready.

### Core UI screens

- Dashboard: workspace with dockable panels
- Workflow Editor: node-based graph builder
- Global Chat: agentic assistant with tool use
- Mini-Apps: form-style UI for workflows
- Assets: file explorer with previews
- Models Manager: model downloads, filtering and README access

## What You Can Do

![Workflow Editor](/docs/assets/workflow.png)

- **Visual workflow editor** – link nodes to process text, images, audio or video.
- **Extensive model support** – use models from OpenAI, Anthropic, Google, Hugging Face, Groq, Together, Replicate,
  Cohere and more — or run locally with Ollama.
- **Advanced agents** – build multi-step agents that can plan, reason and browse the web.
- **Vector search & RAG** – index your documents and ask questions about them.
- **System tray access** – launch workflows and manage your clipboard from anywhere.
- **Mini‑app builder** – turn a workflow into a standalone application.
- **Chat interface** – create custom chatbots for your projects.
- **Global Chat** – start conversations from anywhere in the workspace with AI agents and tools.
- **OpenAI‑compatible API & extensions** – connect NodeTool to other apps and services.
- **Node Packs** – install extra nodes from the [NodeTool Packs Registry](node-packs.md).

### Startup flow

At launch NodeTool loads:

1. Node metadata and types from `/api/nodes/metadata`
2. Your open workflows and layout
3. Provider settings and installed models
4. Recent chat threads

## Documentation

### Getting Started

- **[Installation](installation.md)** – Download and install NodeTool
- **[Getting Started](getting-started.md)** – Your first workflow and basic concepts
- **[Tips and Tricks](tips-and-tricks.md)** – Shortcuts and workflow ideas
- **[Cookbook](cookbook.md)** – Cookbook for workflows
- **UI Overview** – Read [User Interface](user-interface.md) for a full map of the application.

### Core Features

- **[Workflow Editor](workflow-editor.md)** – Build workflows with drag-and-drop nodes
- **[User Interface](user-interface.md)** – Complete guide to the NodeTool UI
- **[Global Chat](global-chat.md)** – AI chat interface with agents and tools
- **[Supported Models](models.md)** – Comprehensive guide to all AI models and providers
- **[Providers](providers.md)** - Provider support
- **[Models Manager](models-manager.md)** – Manage AI models and providers
- **[Asset Management](asset-management.md)** – Handle files, images, and media
- **[Base Nodes Reference](base-nodes.md)** – Complete reference for all available base nodes

### Advanced Topics

- **[Architecture](architecture.md)** – Technical overview and system design

## Quick Start

1. Install NodeTool (see [Installation](installation.md)).
1. Launch the app and download models.
1. Start from a template or blank canvas.
1. Drag nodes, connect them, and click Run to see results.

Want more details? Check out our [Getting Started](getting-started.md) guide and explore the complete feature
documentation above.

## Community

Share your ideas, ask questions, or contribute:

- Discord: https://discord.gg/WmQTWZRcYE
- GitHub: https://github.com/nodetool-ai/nodetool

Open source under AGPL‑3.0. Built by makers, for makers.
