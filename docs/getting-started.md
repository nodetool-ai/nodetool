---
layout: page
title: "Getting Started"
description: "Run your first NodeTool workflow."
---

Install NodeTool, open a template, run it, edit it, ship it as a Mini-App.

## Step 1 — Install

### Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **RAM** | 8 GB | 16 GB+ |
| **Disk** | 10 GB free | 50 GB+ for models |
| **GPU** | None | 8 GB+ VRAM for local inference |
| **OS** | macOS 13+, Windows 10+, Ubuntu 22+ | Latest |

No GPU? Use cloud providers with your own keys. See [hardware notes](installation.md#what-different-tasks-need).

### Install

1. Download from [nodetool.ai](https://nodetool.ai)
2. Run the installer
3. Launch — no setup wizard

![Dashboard](assets/screenshots/dashboard-overview.png)

Python and inference engines install on demand the first time you use local models. See the [installation guide](installation.md) for platform notes.

### Local models (optional)

1. Open **Models** in the sidebar
2. Pick:
   - **Flux** or **Qwen Image** for images (8–12 GB VRAM)
   - **Llama** or **Qwen** for text
3. Wait for downloads (~20 GB)

Cloud-only: open **Settings → Providers**, paste your key from [OpenAI](https://platform.openai.com), [Anthropic](https://www.anthropic.com), or [Google](https://ai.google.dev). Skip the local download.

---

## Step 2 — Run a workflow

Open a template from the Dashboard.

![Templates](assets/screenshots/templates-grid.png)

### Movie Posters

1. Dashboard → Templates → **Movie Posters**
2. The graph opens: inputs on the left, an agent in the middle, image generator on the right, preview at the end.
3. Type into the inputs:
   - **Title**: Ocean Depths
   - **Genre**: Sci-Fi Thriller
   - **Audience**: Adults who love mystery
4. Press <kbd>Ctrl/⌘ + Enter</kbd> to run.

### Creative Story Ideas

![Editor](assets/screenshots/editor-empty-state.png)

1. Dashboard → Templates → **Creative Story Ideas**
2. Set inputs:
   - **Genre**: Cyberpunk
   - **Character**: Rogue AI detective
   - **Setting**: Neon-lit underwater city
3. Run it.

---

## Step 3 — Edit

1. Save with <kbd>Ctrl/⌘ + S</kbd>.
2. Change inputs and re-run.
3. Click a node to see its settings on the right. Hover a connection to see the data flowing through it. Press `Space` and search "Preview" to drop a preview node anywhere on the canvas.

---

## Step 4 — Ship as a Mini-App

A Mini-App hides the graph and exposes only the inputs and outputs.

1. Open the workflow.
2. Click **Mini-App** in the toolbar.

For a custom UI, see [VibeCoding](vibecoding.md).

---

## Next

| Goal | Page |
|------|------|
| How workflows work | [Key Concepts](key-concepts.md) |
| Full interface | [User Interface](user-interface.md), [Workflow Editor](workflow-editor.md) |
| More examples | [Gallery](workflows/), [Cookbook](cookbook.md) |
| Models and providers | [Models & Providers](models-and-providers.md) |
| Deploy | [Deployment](deployment.md) |
| Stuck | [Troubleshooting](troubleshooting.md), [Debugging](workflow-debugging.md) |

[Discord](https://discord.gg/WmQTWZRcYE) · [GitHub](https://github.com/nodetool-ai/nodetool/issues) · [Glossary](glossary.md)
