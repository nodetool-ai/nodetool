______________________________________________________________________

---
layout: default
title: Getting Started
---

# Getting Started

Welcome to **NodeTool**! Follow the checklist below to install the app, download your first models, and run a simple workflow in just a few minutes.

## Before You Begin

- **Supported platforms:** Windows, macOS, and Linux (x86_64). ARM builds are experimental.
- **Hardware:** 16 GB RAM and a GPU with ≥8 GB VRAM are recommended for local model inference.
- **Disk space:** Keep at least 20 GB free for base models and caches.
- **Accounts:** Optional API keys for OpenAI, Anthropic, Gemini, or other cloud providers if you plan to run remote models.

> **Tip:** NodeTool is local-first—no project data leaves your machine unless you configure a cloud provider or explicitly upload assets.

## 1. Install NodeTool

1. Download the latest installer from [nodetool.ai](https://nodetool.ai) or the [GitHub Releases page](https://github.com/nodetool-ai/nodetool/releases).
2. Run the installer and launch NodeTool. The desktop app bundles both the UI and the background server process, so no extra services are required.
3. Need a detailed walkthrough? Visit the dedicated [Installation](installation.md) guide for platform-specific instructions and troubleshooting tips.

## 2. Install Models

When NodeTool starts for the first time it shows the **Model Setup** screen.

1. Choose a **recommended text model** (GPT-OSS or another open-source LLM) for agent workflows and a **vision/image model** (Flux, Stable Diffusion, etc.) if you plan to generate media.
2. Click **Download**. Large models can take several minutes—keep the window open until the progress bar completes.
3. Optional: Open **Settings → Providers** to add API keys for OpenAI, Anthropic, Hugging Face, Gemini, Together, Groq, and more.
4. Optional: Browse the **Packs** menu to install Node Packs such as Replicate, Fal.ai, or ElevenLabs for specialized tasks.

> **Reminder:** You can always click **Recommended Models** inside compatible nodes to auto-select a suitable model if you’re unsure which one to use.

## 3. Build Your First Workflow

1. From the home screen, click **New Workflow** or open the **Templates** gallery if you prefer to start from an example.
2. Inside the canvas, press the **Space bar** or double-click to open the **Node Menu**. Search for “String Input” and add it to the canvas.
3. Enter a short prompt into the String Input node (for example, “Write a welcome message for new users”).
4. Drag a connection from the String Input output port, drop it on the canvas, and pick **Create Preview Node** to visualize the text.
5. Connect additional nodes (LLM, Image Generator, Document Loader, etc.) by repeating the same drag-and-drop flow.

> **Keyboard shortcut:** Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> (or <kbd>⌘</kbd> + <kbd>Enter</kbd> on macOS) to run the entire workflow without touching the mouse.

## 4. Run & Inspect Results

1. Click the **Run** button in the bottom-right corner (play icon) to execute the workflow.
2. Watch the status indicators on each node—green checkmarks signal success, while red badges contain error details.
3. Use the **Preview node** or the **Global Chat** sidebar to inspect outputs, ask follow-up questions, or rerun a specific node with new parameters.
4. Save your project so you can reopen it from the **Recent Workflows** list later.

## 5. Explore More Features

- **Local vs. cloud models:** Mix and match local inference for privacy with cloud providers when you need extra power or proprietary capabilities.
- **Document indexing:** Use Retrieval-Augmented Generation to chat with PDFs, text files, and websites you’ve indexed in the Asset Manager.
- **Chat-driven workflows:** Trigger any workflow directly from the Global Chat, combining conversations with tool or agent execution.
- **Mini-apps & Packs:** Package workflows into standalone apps or extend NodeTool with Packs from the registry.

## 6. Next Steps

Browse the rest of the documentation to dive deeper into specific features:

- [Workflow Editor](workflow-editor.md) for advanced node tips.
- [Base Nodes](base-nodes.md) for a catalog of every built-in node.
- [Tips & Tricks](tips-and-tricks.md) for productivity shortcuts.

Need help? Join the [Discord community](https://discord.gg/26m5xBwe) to meet other builders, share templates, and get support from the NodeTool team.
