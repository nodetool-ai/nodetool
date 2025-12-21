---
layout: page
title: "Getting Started"
description: "Build your first AI workflow in 10 minutes – no coding or AI experience required."
---

Welcome! This hands-on tutorial guides you through installing NodeTool and running your first AI workflow. **No prior experience with AI or coding is required** – we'll explain everything as we go.

> **What you'll accomplish**: In about 10 minutes, you'll install NodeTool, run a template workflow, and learn how to trigger it from chat and as a standalone app.

If you'd like a high-level overview first, read the [Start Here guide](index.md#start-here).

---

## Before You Begin

**What is a workflow?** Think of it as a recipe that NodeTool follows automatically. Each step (called a "node") does one thing – like generating text or processing an image – and passes its result to the next step.

**What are AI models?** Pre-trained programs that have learned to do specific tasks. You don't need to train them – just pick one and use it. NodeTool handles all the technical details.

---

## Step 1 — Install NodeTool

### Download and Install

1. **Download** the desktop app from [nodetool.ai](https://nodetool.ai) for your system:
   - **macOS** – Intel or Apple Silicon (M1/M2/M3)
   - **Windows** – Requires Windows 10 or later
   - **Linux** – AppImage or Debian package

2. **Run the installer** – it will set up everything automatically, including Python and AI engines

3. **Launch NodeTool** – on first run, choose where to install (the default location works for most people)

> **Need help?** See the detailed [Installation Guide](installation.md) for GPU requirements, troubleshooting, and platform-specific tips.

### Sign In (Optional)

- **Sign in with Supabase** to sync your workflows and assets across devices
- **Use Localhost Mode** for fully offline, private operation (`Settings → Authentication`)

### Install Your First AI Models

For the tutorials to work, you'll need some AI models:

1. Open **Models → Model Manager** from the top navigation
2. Install these recommended starter models:
   - **GPT-OSS** – for text generation and chat
   - **Flux** – for image generation
3. Wait for downloads to complete (~20 GB total)

> **Tip**: You can skip local models and use cloud providers instead (like OpenAI or Anthropic). Just add your API key in `Settings → Providers`.

✅ **Checkpoint**: You should now see the NodeTool Dashboard with Templates and Recent Workflows panels.

---

## Step 2 — Run Your First Workflow

Let's run a pre-built template to see how workflows work. Pick **one** of these options:

### Option A: Creative Story Ideas (Text Generation)

*Best for: Seeing how AI generates text based on your prompts*

1. **Find the template**: On the Dashboard, look for "Creative Story Ideas" in the Templates panel and click it
2. **Open in Editor**: Click **Open in Editor** to see the workflow canvas
3. **Understand what you see**:
   - **StringInput** node (left) – where you type your prompt
   - **Agent** node (middle) – the AI that generates ideas
   - **Preview** node (right) – where results appear

4. **Customize the prompt**: Click the `StringInput` node and enter something like:
   > "Generate story prompts for sci-fi adventures on alien ocean worlds"

5. **Run it**: Click the **Run** button (bottom-right) or press <kbd>Ctrl/⌘ + Enter</kbd>
6. **Watch the magic**: The Preview node will stream ideas as the AI generates them!

**What just happened?** You sent a text prompt to an AI language model, which generated creative story ideas based on your input.

### Option B: Transcribe Audio (Speech-to-Text)

*Best for: Converting spoken audio into written text*

1. **Find the template**: Look for "Transcribe Audio" in Templates and open it in the Editor
2. **Understand what you see**:
   - **AudioInput** – where you upload an audio file
   - **Automatic Speech Recognition** – the AI that converts speech to text
   - **StringOutput** – where the transcription appears

3. **Add an audio file**: Click the `AudioInput` node, choose **Upload**, and select a `.wav` or `.mp3` file (a voice memo from your phone works great!)

4. **Run it**: Click **Run** or press <kbd>Ctrl/⌘ + Enter</kbd>
5. **Read the results**: Your transcribed text appears in the StringOutput panel

**What just happened?** You fed audio to an AI speech recognition model (like Whisper), which converted the spoken words into written text.

✅ **Checkpoint**: You've successfully run your first AI workflow! The results appeared in the output node.

---

## Step 3 — Save and Run from Chat

Now let's save your workflow and run it from NodeTool's chat interface.

1. **Save your workflow**: Press <kbd>Ctrl/⌘ + S</kbd> or use `File → Save`. Give it a memorable name like "My Story Generator"

2. **Open Global Chat**: Click **Chat** in the left sidebar to open the full-screen AI assistant

3. **Attach your workflow**: In the chat composer (bottom), click the **Workflow Menu** and select your saved workflow

4. **Run it conversationally**: Type a prompt like "write a story about exploring ocean worlds" and press **Send**

5. **Watch it stream**: The AI will run your workflow and stream results directly into the chat!

**Why is this useful?** Chat mode lets you run workflows conversationally without opening the editor. Great for quick iterations or sharing with teammates who don't want to see the technical details.

✅ **Checkpoint**: Your workflow now runs from both the editor and chat interface.

---

## Step 4 — Create a Mini-App

Turn your workflow into a simple app that anyone can use – no knowledge of NodeTool required.

1. **Open your workflow** in the editor
2. **Click Mini-App** in the top-right corner
3. **Run the Mini-App**: You'll see a clean interface with just the inputs and outputs
4. **Share it**: Mini-Apps hide all the complexity – perfect for teammates or clients

**What just happened?** NodeTool generated a simplified user interface from your workflow. The same workflow runs underneath, but users only see what they need to interact with.

✅ **Checkpoint**: You now have **three ways** to run the same workflow: Editor, Chat, and Mini-App.

---

## Recap: What You Learned

🎉 **Congratulations!** You've completed the NodeTool basics:

- ✅ Installed NodeTool and AI models
- ✅ Ran a template workflow
- ✅ Understood nodes, connections, and data flow
- ✅ Saved and ran workflows from chat
- ✅ Created a Mini-App for easy sharing

---

## Next Steps

### Learn More
- **[Key Concepts](key-concepts.md)** – Deeper understanding of workflows and AI
- **[User Interface](user-interface.md)** – Master the NodeTool interface
- **[Workflow Editor](workflow-editor.md)** – Build your own workflows from scratch

### Explore Examples
- **[Workflow Cookbook](cookbook.md)** – Patterns and best practices
- **[Example Gallery](workflows/)** – 19+ ready-to-use workflows
- **[Tips & Tricks](tips-and-tricks.md)** – Power user shortcuts

### Go Further
- **[Models & Providers](models-and-providers.md)** – Set up cloud AI or local models
- **[Global Chat](global-chat.md)** – Advanced chat and agent features
- **[Deployment Guide](deployment.md)** – Share workflows with the world

---

## Need Help?

- **[Glossary](glossary.md)** – Plain-English definitions of all terms
- **[Discord Community](https://discord.gg/26m5xBwe)** – Get help from other users
- **[GitHub Issues](https://github.com/nodetool-ai/nodetool/issues)** – Report bugs or request features
