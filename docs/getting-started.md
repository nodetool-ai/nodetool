---
layout: page
title: "Getting Started"
description: "Build your first AI workflow in 10 minutes."
---

This guide walks you through running your first NodeTool workflow. No AI experience or coding required.

> **What you'll do**:
> - ✅ Run a complete AI workflow
> - ✅ See results generate in real-time
> - ✅ Learn multiple ways to run workflows
> - ✅ Understand the visual workflow builder

For a visual overview first, see the [Start Here guide](index.md#start-here).

---

## Before You Begin

**Workflow**: A series of connected steps (nodes). Each node performs one operation and passes results to the next.

**AI Model**: A pre-trained program for a specific task (image generation, text analysis, etc.). You don't train them—select the appropriate model for your task.

---

## Step 1 — Install NodeTool

### Download and Install

1. **Download** from [nodetool.ai](https://nodetool.ai):
   - **macOS** – Intel or Apple Silicon (M1/M2/M3)
   - **Windows** – Windows 10 or later
   - **Linux** – AppImage or Debian package

2. **Run the installer** – sets up Python and AI engines automatically

3. **Launch NodeTool** – choose install location on first run (default works for most users)

> See the [Installation Guide](installation.md) for GPU requirements and troubleshooting.

### Sign In (Optional)

- **Sign in with Supabase** to sync your workflows and assets across devices
- **Use Localhost Mode** for fully offline, private operation (`Settings → Authentication`)

### Install Your First AI Models

To run the example workflows:

1. Open **Models → Model Manager**
2. Install recommended starter models:
   - **Flux** or **SDXL** – for image generation (requires 8-12 GB VRAM)
   - **GPT-OSS** (optional) – for text generation
3. Wait for downloads (~20 GB total)

> **No GPU?** Skip local models and use cloud services (OpenAI, Replicate) by adding API keys in `Settings → Providers`. See [Hardware Requirements](installation.md#hardware-requirements-by-task).

✅ **Checkpoint**: NodeTool Dashboard with Templates and examples ready.

---

## Step 2 — Run Your First Workflow

Run a pre-built template. Choose one:

### Option A: Generate Movie Posters (Image Generation)

1. **Find the template**: On the Dashboard, look for "Movie Posters" in the Templates panel and click it
2. **Open in Editor**: Click **Open in Editor** to see the workflow canvas
3. **Understand the pipeline**:
   - **Input nodes** (left) – where you describe your movie
   - **AI Strategy node** (middle) – plans the visual concept
   - **Image Generator** (right) – creates the actual poster
   - **Preview** – where your result appears

4. **Customize your poster**: Click the input nodes and describe your movie:
   - **Title**: "Ocean Depths"
   - **Genre**: "Sci-Fi Thriller"
   - **Audience**: "Adults who love mystery"

5. **Run it**: Click **Run** (bottom-right) or press <kbd>Ctrl/⌘ + Enter</kbd>
6. **View results**: Poster generates step by step

**Result**: Input → AI strategy → image generation → output.

### Option B: Creative Story Ideas (Text Generation)

1. **Find the template**: Look for "Creative Story Ideas" in Templates and open it
2. **Understand the flow**:
   - **Input nodes** – your creative parameters
   - **AI Agent** – generates ideas based on inputs
   - **Preview** – where ideas appear as they're created

3. **Set your parameters**: Click the input nodes:
   - **Genre**: "Cyberpunk"
   - **Character**: "Rogue AI detective"
   - **Setting**: "Neon-lit underwater city"

4. **Generate**: Click **Run** or press <kbd>Ctrl/⌘ + Enter</kbd>
5. **View results**: Ideas stream in one at a time

**Result**: Parameters → AI agent → generated ideas.

✅ **Checkpoint**: First workflow complete. Results appear in the canvas.

---

## Step 3 — Customize and Iterate

1. **Save your workflow**: Press <kbd>Ctrl/⌘ + S</kbd>. Give it a descriptive name.

2. **Modify inputs**: Change parameters and run again.
   
3. **Explore the canvas**:
   - Click nodes to see settings
   - Hover over connections to see data flow
   - Click Preview nodes to inspect intermediate results

Workflows are reusable. Generate variations, refine parameters, save modifications.

✅ **Checkpoint**: You can customize and iterate on workflows.

---

## Step 4 — Share as a Mini-App

Convert a workflow into a simplified interface:

1. **Open your workflow** in the editor
2. **Click Mini-App** (top-right)
3. **View simplified interface**: Shows only inputs and outputs

Mini-Apps let others run workflows without seeing the underlying complexity.

✅ **Checkpoint**: Three ways to work: Visual Editor (full control), Chat (conversational), Mini-App (simplified interface).

---

## Recap

Completed:
- ✅ Installed NodeTool and AI models
- ✅ Ran a complete AI workflow
- ✅ Understood nodes, connections, and data flow
- ✅ Customized and iterated on workflows
- ✅ Shared a workflow as a Mini-App

---

## What's Next

### Learn More
- **[Key Concepts](key-concepts.md)** – Deeper understanding of workflows and AI
- **[User Interface Guide](user-interface.md)** – Master every tool and feature
- **[Workflow Editor](workflow-editor.md)** – Build custom workflows from scratch
- **[Tips & Tricks](tips-and-tricks.md)** – Power user techniques

### Explore Examples
- **[Workflow Gallery](workflows/)** – 19+ ready-to-use workflows
- **[Workflow Patterns](cookbook.md)** – Common patterns and best practices
- **[Node Library](node-packs.md)** – Discover all available nodes

### Go Further
- **[Models & Providers](models-and-providers.md)** – Set up more AI models
- **[Asset Management](asset-management.md)** – Organize your files
- **[Deployment Guide](deployment.md)** – Share workflows with the world

### Debug & Troubleshoot
- **[Workflow Debugging Guide](workflow-debugging.md)** – Debug workflows with Preview nodes and logs
- **[Troubleshooting](troubleshooting.md)** – Solve common problems
- **[Comparisons](comparisons.md)** – How NodeTool compares to other tools (includes migration guides)

---

## Need Help?

- **[Glossary](glossary.md)** – Plain-English definitions of all terms
- **[Discord Community](https://discord.gg/WmQTWZRcYE)** – Get help from other users
- **[GitHub Issues](https://github.com/nodetool-ai/nodetool/issues)** – Report bugs or request features
