---
layout: page
title: "Getting Started"
description: "Build your first AI workflow in 10 minutes."
---

Run your first NodeTool workflow. No AI experience or coding needed.

**You'll:**
- Run a complete workflow
- See results generate live
- Customize inputs and iterate
- Share as a Mini-App

For a visual overview first, see [Start Here](index.md#start-here).

## Step 1 — Install NodeTool

### Check Requirements

Before installing, make sure your machine meets the minimum requirements:

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **RAM** | 8 GB | 16 GB+ |
| **Disk** | 10 GB free | 50 GB+ (for models) |
| **GPU** | None (CPU works) | 8 GB+ VRAM for local AI |
| **OS** | macOS 13+, Windows 10+, Ubuntu 22+ | Latest version |

> **No GPU?** No problem. You can use cloud AI providers (OpenAI, Anthropic, Replicate) instead of local models. See [Hardware Requirements](installation.md#what-different-tasks-need) for details.

### Install

1. **Download** from [nodetool.ai](https://nodetool.ai) for macOS, Windows, or Linux
2. **Run the installer** — sets up Python and AI engines automatically
3. **Launch NodeTool** — the dashboard appears when ready

> Need help? See [Installation Guide](installation.md) for platform-specific instructions and troubleshooting.

### Install AI Models (Optional)

For running AI locally without cloud APIs:

1. Open **Models** from the sidebar
2. Install starter models:
   - **Flux** or **Qwen Image** — image generation (needs 8–12 GB VRAM)
   - A text model like **Llama** or **Qwen** — chat and text generation
3. Wait for downloads (~20 GB total)

> **Using cloud instead?** Go to **Settings → Providers**, paste an API key from [OpenAI](https://platform.openai.com), [Anthropic](https://www.anthropic.com), or [Google](https://ai.google.dev), and skip local model downloads.

**How to verify:** You should see the Dashboard with template workflows listed. If models are installed, they appear with a green checkmark in the Models panel.

---

## Step 2 — Run Your First Workflow

Pick one template to try:

### Option A: Generate Movie Posters

1. **Find it**: Dashboard → Templates → "Movie Posters"
2. **Open in Editor**: See the workflow canvas
3. **How it works**:
   - Input nodes (left) - Describe your movie
   - AI Strategy node (middle) - Plans the visual
   - Image Generator (right) - Creates the poster
   - Preview - Shows your result

4. **Try it**: Click the input nodes and type:
   - **Title**: "Ocean Depths"
   - **Genre**: "Sci-Fi Thriller"
   - **Audience**: "Adults who love mystery"

5. **Run**: Click **Run** (bottom-right) or press <kbd>Ctrl/⌘ + Enter</kbd>
6. **Watch**: Poster generates step by step

### Option B: Creative Story Ideas

![Creative Story Ideas Workflow](assets/screenshots/creative-story-workflow.png)

1. **Find it**: Dashboard → Templates → "Creative Story Ideas"
2. **How it works**:
   - Input nodes - Your parameters
   - AI Agent - Generates ideas
   - Preview - Shows results

3. **Try it**: Click the input nodes and type:
   - **Genre**: "Cyberpunk"
   - **Character**: "Rogue AI detective"
   - **Setting**: "Neon-lit underwater city"

4. **Run**: Click **Run** or <kbd>Ctrl/⌘ + Enter</kbd>
5. **Watch**: Ideas appear one at a time

✅ **Done** - You ran your first workflow.

---

## Step 3 — Customize and Iterate

1. **Save**: Press <kbd>Ctrl/⌘ + S</kbd> and name it

2. **Change things**: Edit inputs and run again
   
3. **Explore**:
   - Click nodes to see settings
   - Hover connections to see data flow
   - Click Preview nodes for intermediate results

Workflows are reusable. Try variations. Refine. Save.

✅ **Done** - You can customize workflows.

---

## Step 4 — Share as a Mini-App

Convert a workflow into a simplified interface:

1. **Open your workflow** in the editor
2. **Click Mini-App** (top-right)
3. **See simplified view**: Only inputs and outputs, no graph

Mini-Apps hide complexity. Others can use your workflow without seeing how it works.

✅ **Done** - You know three ways to work: Visual Editor (full control), Mini-App (simple interface).

---

## What You Learned

| Step | What You Did |
|------|-------------|
| **Install** | Downloaded NodeTool, set up models or cloud providers |
| **Run** | Executed a template workflow end-to-end |
| **Customize** | Changed inputs and saw different results |
| **Share** | Converted a workflow into a Mini-App |

---

## Next Steps

Pick what interests you most:

| Goal | Where to Go |
|------|------------|
| Understand how workflows work | [Key Concepts](key-concepts.md) |
| Learn the full interface | [User Interface](user-interface.md), [Workflow Editor](workflow-editor.md) |
| Try more workflows | [Workflow Gallery](workflows/), [Workflow Patterns](cookbook.md) |
| Set up more AI models | [Models & Providers](models-and-providers.md) |
| Build workflows from scratch | [Workflow Editor](workflow-editor.md), [Tips & Tricks](tips-and-tricks.md) |
| Deploy to production | [Deployment Guide](deployment.md) |
| Fix a problem | [Troubleshooting](troubleshooting.md), [Workflow Debugging](workflow-debugging.md) |

**Community:** [Discord](https://discord.gg/WmQTWZRcYE) · [GitHub Issues](https://github.com/nodetool-ai/nodetool/issues) · [Glossary](glossary.md)
