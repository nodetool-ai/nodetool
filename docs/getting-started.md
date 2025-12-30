---
layout: page
title: "Getting Started"
description: "Build your first AI workflow in 10 minutes and discover how to run it in multiple ways—no coding required."
---

Welcome! This hands-on guide shows you how NodeTool works—fast. **No AI experience or coding required** – just curiosity and willingness to explore.

> **What you'll accomplish**: In about 10 minutes, you'll:
> - ✅ Run a complete AI workflow
> - ✅ Watch results generate in real-time
> - ✅ Learn multiple ways to use workflows
> - ✅ Understand the visual workflow builder

**Why NodeTool?** You're learning how to build AI workflows with full transparency and control—whether you're creating content, analyzing data, or automating tasks.

If you'd like a visual overview first, check out the [Start Here guide](index.md#start-here).

---

## Before You Begin

**What is a workflow?** Think of it like a recipe or a pipeline. Each step (called a "node") does one thing—like generating an image, analyzing text, or transforming data—and passes the result to the next step. Connect them visually to build something powerful.

**What are AI models?** Pre-trained programs that have learned specific skills. Want to generate images? There's a model. Analyze documents? There's a model. You don't train them—just pick the right tool for your task.

---

## Step 1 — Install NodeTool

### Download and Install

1. **Download** the desktop app from [nodetool.ai](https://nodetool.ai) for your system:
   - **macOS** – Intel or Apple Silicon (M1/M2/M3)
   - **Windows** – Requires Windows 10 or later
   - **Linux** – AppImage or Debian package

2. **Run the installer** – it will set up everything automatically, including Python and AI engines

3. **Launch NodeTool** – on first run, choose where to install (the default location works for most people)

> **Need help?** See the detailed [Installation Guide](installation.md) for GPU requirements, troubleshooting, and platform-specific tips. Check the [Hardware Requirements](installation.md#hardware-requirements-by-task) to see what your system can run.

### Sign In (Optional)

- **Sign in with Supabase** to sync your workflows and assets across devices
- **Use Localhost Mode** for fully offline, private operation (`Settings → Authentication`)

### Install Your First AI Models

To run the example workflows, you'll need some AI models:

1. Open **Models → Model Manager** from the top navigation
2. Install these recommended starter models:
   - **Flux** or **SDXL** – for image generation (requires 8-12 GB VRAM)
   - **GPT-OSS** (optional) – for text generation
3. Wait for downloads to complete (~20 GB total)

> **Tip**: Don't have a powerful GPU? No problem! Skip local models and use cloud services (like OpenAI or Replicate) by adding your API key in `Settings → Providers`. You'll still accomplish the same tasks. See [Hardware Requirements](installation.md#hardware-requirements-by-task) for detailed specs by task.

✅ **Checkpoint**: You should now see the NodeTool Dashboard with Templates and example workflows ready to explore.

---

## Step 2 — Run Your First Workflow

Let's run a pre-built template to see how workflows work. Pick **one** of these options:

### Option A: Generate Movie Posters (Image Generation)

*Best for: Seeing AI transform text descriptions into visuals*

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

5. **Run it**: Click the **Run** button (bottom-right) or press <kbd>Ctrl/⌘ + Enter</kbd>
6. **Watch the process**: Your poster will generate step by step!

**What just happened?** You provided inputs, AI planned a strategy, then generated a visual result. The entire pipeline is visible on your canvas.

### Option B: Creative Story Ideas (Text Generation)

*Best for: Seeing AI generate ideas and content*

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
5. **Watch ideas flow**: Ideas stream in one at a time!

**What just happened?** You set parameters and AI generated multiple unique ideas. Perfect for brainstorming or starting new projects.

✅ **Checkpoint**: You've run your first AI workflow! The results appeared right in the workflow canvas.

---

## Step 3 — Customize and Iterate

Now let's personalize your workflow and see how easy it is to experiment.

1. **Save your workflow**: Press <kbd>Ctrl/⌘ + S</kbd> or use `File → Save`. Give it a descriptive name

2. **Try different inputs**: Go back and change your parameters:
   - Different movie titles, genres, or audiences
   - New story settings and characters
   
3. **Run again**: Each time you click Run, you get fresh results

4. **Explore the canvas**: Try these experiments:
   - Click any node to see its settings
   - Hover over connections to see what data flows through
   - Click Preview nodes to inspect results at any stage

**Why is this powerful?** Unlike one-off AI tools, NodeTool lets you iterate instantly. Generate dozens of variations, pick the best ones, refine them. It's a workflow you can save, modify, and reuse.

✅ **Checkpoint**: You've learned to customize and iterate—the core of working with AI workflows.

---

## Step 4 — Share as a Mini-App

Turn your workflow into a simple app that anyone can use—no NodeTool knowledge required.

1. **Open your workflow** in the editor
2. **Click Mini-App** in the top-right corner
3. **See the simplified view**: You'll see a clean interface with just the inputs and outputs
4. **Share it**: Perfect for collaborators, clients, or anyone who just wants results—without seeing the workflow complexity

**What just happened?** NodeTool generated a user-friendly interface from your workflow. The same AI pipeline runs underneath, but users see only what they need: inputs to customize and results to use. Like packaging a complex tool into a simple app.

✅ **Checkpoint**: You now have **three ways** to work: Visual Editor (full control), Chat (conversational), and Mini-App (simplified for anyone).

---

## Recap: What You've Learned

🎉 **Congratulations!** You've mastered the NodeTool basics:

- ✅ Installed NodeTool and AI models
- ✅ Run a complete AI workflow
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
