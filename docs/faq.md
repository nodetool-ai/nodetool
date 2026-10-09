---
layout: page
title: "FAQ"
permalink: /faq
description: "Short answers to common questions about NodeTool: cost, offline use, models, hardware, data location, licensing, updates, and ComfyUI."
---

Each answer links to the page that covers the topic in full.

## Getting started

### Is NodeTool free?
The app is free and open source under AGPL-3.0. With your own API keys you pay each cloud provider directly, and local models cost nothing after the download. The hosted Cloud also offers a curated model catalog paid with NodeTool credits. See [Costs and Credits](costs-and-credits.md).

### What does a run cost?
The cost depends on the models you pick. NodeTool estimates the cost of a workflow before you run it, in the **Cost estimate** section of the right panel, and records what each provider call cost afterward. See [Costs and Credits](costs-and-credits.md#estimating-a-run-before-you-start).

### Do I need an API key?
You need one model source before an agent or a generation node can run. That can be a cloud provider with a key, a provider you sign in to (a Claude subscription in the desktop app, a ChatGPT account, or Hugging Face), or a local runner such as Ollama. See [Connect an AI provider](installation.md#connect-an-ai-provider).

### Which operating systems are supported?
The desktop app ships for macOS (Apple Silicon and Intel), Windows (x64), and Linux (AppImage and Flatpak). See [Desktop App](desktop-app.md#platforms-and-downloads).

### Where do I start?
Install the app, connect a provider, then pick a type on the **Home** tab and describe what you want in one sentence. The [Getting Started](getting-started.md) guide walks through a first project, and the [Templates Gallery](templates-gallery.md) has examples you can copy.

## Models and hardware

### Which models can I use?
NodeTool reaches cloud models from more than 30 providers, including OpenAI, Anthropic, Google Gemini, xAI, FAL, and Replicate, and it runs local models too. See [Models and Providers](models-and-providers.md) for the catalog and [Providers](providers.md) for setup.

### Can I use NodeTool offline?
Yes, with local models. The desktop app runs its server on your machine, and local models run without a connection once they are downloaded. Cloud providers need internet. See [Models and Providers](models-and-providers.md#local-vs-cloud).

### Do I need a GPU?
No. Cloud providers need no graphics card. For local models, NVIDIA cards run the HuggingFace pack, llama.cpp, and Ollama, Apple Silicon Macs also run MLX, and a CPU works but slowly. See [What different tasks need](installation.md#what-different-tasks-need) and [GPU requirements](installation.md#gpu-requirements).

### How big are local models?
Expect 4 to 20 GB per model. Models, Python, and model runners download only when you install them. See [What downloads later](installation.md#what-downloads-later) and [Models Manager](models-manager.md).

### Can I run Ollama or llama.cpp models?
Yes. Install Ollama from [ollama.com](https://ollama.com), pull a model with `ollama pull <model>`, and it appears in NodeTool while Ollama runs. In-process llama.cpp installs from **Package Manager → Software**. A `llama-server` you run yourself connects through `LLAMA_CPP_URL`. See [Connect an AI provider](installation.md#connect-an-ai-provider).

## Data and privacy

### Where are my files stored?
On the desktop, the database, assets, and vector store live in `~/.local/share/nodetool/` on macOS and Linux and in `%APPDATA%\nodetool\` on Windows. See [Where your data lives](desktop-app.md#where-your-data-lives).

### Does my data leave my machine?
Only when a node calls a cloud provider you configured, when you download something, or when you turn on an optional feature such as update checks. See [Privacy and Data Handling](privacy.md).

### Are my API keys safe?
Keys are stored encrypted with AES-256-GCM in the local database. The encryption key lives in your operating system keychain, or in `SECRETS_MASTER_KEY` if you set it. See [Privacy and Data Handling](privacy.md#how-secrets-are-encrypted).

## Studio, Cloud, and hosting

### What is the difference between Studio and Cloud?
Studio is the desktop app, which can run local models and work offline. Cloud is the hosted browser version with the same canvas and nodes, and no local models. Both come from the same AGPL-3.0 source. See [Studio or Cloud](index.md#studio-or-cloud).

### Can I host NodeTool myself?
Yes. The repository ships a `docker-compose.yml` that runs one server. It has no login by default, so keep it on a private network or enable Supabase authentication first. See [Self-Hosted Deployment](self-hosted-deployment.md).

### Can other tools drive NodeTool?
Yes. NodeTool has a REST and WebSocket API, a CLI, and an MCP server that gives agents such as Claude Code access to workflows and generation. See [API Reference](api-reference.md), [CLI Reference](cli.md), and [MCP Server](mcp-server.md).

## Using NodeTool

### Can I import my ComfyUI workflows?
You can run them, not convert them. Export the workflow from ComfyUI in API (prompt) format and load it into a Run ComfyUI Workflow node, which turns its load and save nodes into typed inputs and outputs. See [ComfyUI](comfyui.md).

### Can I turn a workflow into an app for other people?
Yes. A mini app puts a form or interface in front of a workflow, with the workflow's inputs and outputs as widgets. See [Mini Apps](mini-apps.md) and [App Builder](app-builder.md).

### Can I add my own nodes?
Yes. Node packs add nodes to the node menu, and you can write your own in TypeScript. See [Node Packs](node-packs.md) and the [Custom Nodes Guide](developer/custom-nodes-guide.md).

### What are the keyboard shortcuts?
Press `Ctrl + /` or `⌘ + /` in the app. The full list for every editor is in [Keyboard Shortcuts](keyboard-shortcuts.md).

## Licensing and updates

### What license is NodeTool under?
AGPL-3.0. The full text is in the repository's [LICENSE.txt](https://github.com/nodetool-ai/nodetool/blob/main/LICENSE.txt). The AGPL has conditions for modified versions offered over a network, so read it before you redistribute or host a changed copy.

### How do I update the desktop app?
Turn on **Automatic Updates** in **Settings** and the app downloads releases in the background, then shows a **Restart to Update** button. You can also reinstall from the latest download. See [Upgrading](upgrading.md).

### Will an update delete my workflows?
An update does not remove your data directory. The server applies database migrations at start. Back up the data directory before a major update. See [Upgrading](upgrading.md#back-up-first).

### Where can I see what changed in a release?
Release notes are on GitHub, and the [Changelog](changelog.md) page summarizes recent months.

### Something broke. Where do I look?
Check the logs in **Tools → Log Viewer**, then the [Troubleshooting](troubleshooting.md) guide.
