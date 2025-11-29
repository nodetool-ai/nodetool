---
layout: page
title: "Getting Started"
---

This is the hands-on tutorial that walks you through installing NodeTool, running your first workflow, and reusing it from both Global Chat and a Mini-App. If you need a high-level overview first, read the [Start Here flow](index.md#start-here); otherwise jump right in.

---

## Step 1 — Install NodeTool

1. **Download** the desktop build from [nodetool.ai](https://nodetool.ai) for macOS, Windows, or Linux.
2. **Follow the platform instructions** in the [Installation Guide](installation.md) for prerequisites (GPU/VRAM, drivers, Apple Silicon tips).
3. **Launch NodeTool** after installation. Sign in with Supabase, or use Localhost Mode for offline testing (`Settings → Authentication`).
4. **Install the recommended starter models** so the templates run instantly:
   - Open **Models → Model Manager** from the top navigation.
   - Install **GPT-OSS** (agentic LLM) and **Flux** (image generation). Each download shows disk usage; plan for ~20 GB of free space.
   - You can always switch a node to a cloud provider later by pressing the **Models** button on that node.

You now have a fresh workspace with working models and access to the template gallery.

---

## Step 2 — Run a beginner workflow end to end

Pick one of these templates to learn how nodes connect and stream results. Both live in the Dashboard **Templates** panel, so you can open them with a single click.

### Option A: Creative Story Ideas (text generation)

1. **Open** the template from the dashboard and click **Open in Editor**. The canvas shows:
   - `StringInput` (prompt)
   - `Agent` (LLM with planning)
   - `Preview` (streams the generated ideas)
2. **Customize the input** — double-click the `StringInput` node and enter a few guiding details such as “write story prompts for sci-fi explorers visiting ocean worlds.”
3. **Run the workflow** — press the **Run** button in the lower-right corner or use <kbd>⌘/Ctrl + Enter</kbd>. The Preview node streams each idea as the agent produces them.
4. **Experiment** — duplicate the Preview node (right-click → Duplicate) or swap the agent’s model via the **Model** field to compare outputs.

### Option B: Transcribe Audio (speech-to-text)

1. **Open** the “Transcribe Audio” template. You’ll see:
   - `AudioInput` → `Automatic Speech Recognition` (transcription) → `StringOutput`.
2. **Add audio** — click the `AudioInput` node, choose **Upload**, and select a short `.wav` or `.mp3` file (a voice memo works great). The asset lands in the Assets panel for reuse.
3. **Set ASR to your preferred model** — use the node’s **Model** menu to switch between a local Whisper build or a hosted provider such as OpenAI.
4. **Run** the workflow and watch text stream through the `StringOutput` panel. Use **Preview** nodes on the edge between ASR and StringOutput if you want to see intermediate chunks.
5. **Tidy the canvas** — choose **Layout → Reset Layout** if you experiment with additional nodes and need the Dockview panels back in place.

Whichever option you chose, you now have a working workflow that you can save and trigger from other parts of the app.

---

## Step 3 — Save and re-run it from Global Chat

1. **Save** the Creative Story Ideas workflow with a meaningful name (`File → Save` or <kbd>⌘/Ctrl + S</kbd>). Saved workflows appear on the dashboard.
2. **Open Global Chat** (left nav → **Chat**). This brings up the full-screen assistant described in the [Global Chat guide](global-chat.md).
3. Inside chat, click **Workflow Menu** in the composer, select your saved workflow.
4. **Prompt it** — write a prompt that will trigger the workflow from the agent automatically. For example, you could write "write a story about exploring ocean worlds".
5. **Run it** — press the **Send** button in the lower-right corner or use <kbd>⌘/Ctrl + Enter</kbd>. The Preview node streams each idea as the agent produces them.

Use this loop whenever you want to mix structured workflows with conversational prompting.

---

## Step 4 — Turn it into a Mini-App

1. Navigate to a workflow.
2. Click on the **Mini-App** button in the top-right corner.
3. **Run the Mini-App** to verify it behaves the same as the editor version.

Now you have a single workflow that runs identically in the editor, in Global Chat, and as a Mini-App.

---

## Next steps

- Follow the [Start Here](index.md#start-here) golden-path outline if you skipped it.
- Browse the [Workflow Cookbook](cookbook.md) and [Workflow Examples Gallery](/workflows/) for more patterns.
- Learn the [User Interface](user-interface.md) to master Dockview panels, Mini-Apps, and assets.
- Ready to share or deploy? Jump to the [Deployment Guide](deployment.md) or [Deployment Journeys](deployment-journeys.md) when it’s time to ship.
- Join the [Discord community](https://discord.gg/26m5xBwe) to share what you build.
