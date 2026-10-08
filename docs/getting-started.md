---
layout: page
title: "Quick Start"
description: "Install NodeTool, connect your models, and turn one sentence into a finished video with the Video flow."
---

One sentence in, a finished video out. About 30 minutes, mostly render time.
No account. You bring your own API keys.

The plan is text and costs cents. The clips cost dollars. You check the plan
before you pay for clips.

---

## 1. Install and connect

**Download** NodeTool from [nodetool.ai](https://nodetool.ai), install it, and
open it. You do not need a graphics card, because the models run in the cloud. OS details:
[Installation](installation.md).

**Connect your models.** NodeTool uses AI from other companies. An **API key**
is the password that lets NodeTool use your account with them. They bill you
for what you use. Open **Settings → Models & Providers**, then sign in or paste
a key.

| You need | For | Get it from |
|---|---|---|
| Language model | Plans the video | OpenAI, Anthropic, Gemini, Groq, Mistral, or a Claude subscription |
| Video model | Renders the clips | FAL, Replicate, Gemini, OpenAI, kie.ai, and others |
| Voice model (optional) | Reads the voiceover | OpenAI, ElevenLabs, Gemini, and others |

Fastest setup: FAL and one language provider. The [capability matrix](providers.md#capability-matrix) lists which provider covers which model type.

![Connect an AI provider](assets/screenshots/provider-onboarding-dialog.png)

---

## 2. Say what you want

On the **Home** tab, pick **Video**. You can also use **+ New → New timeline**.

Type one sentence:

> A 15-second ad for a desk lamp: a quiet desk at night, the lamp switches on.

Other ways to start:

- **Drop your media** — use your own clips, audio, or images.
- **Start from a script** — write the words first.
- **Start with a blank timeline** — skip the plan.

Press **Continue**. If you close the tab, NodeTool keeps your progress.

---

## 3. Plan the beats

A **beat** is one clip in your video.

**Pick a template:**

| Template | Length | Shape |
|---|---|---|
| 15s ad | 15 s | 16:9 |
| 30s spot | 30 s | 16:9 |
| 60s explainer | 60 s | 16:9 |
| 9:16 social clip | 20 s | 9:16 |
| Trailer | 45 s | 16:9 |
| Music video | 60 s | 16:9 |
| Slideshow | 40 s | 16:9 |

Pick a **Model** at the bottom, then press **Plan the beats**. This step costs
one language model call.

**Edit the plan.** Each beat has a description, a length, a transition, and a
voiceover line. The total length turns to a warning color when the plan is too
long. **Re-plan** writes the beats again and follows your edits.

Press **Continue to look**.

---

## 4. Pick the look and generate

- **Aspect ratio** — comes from the template. You can change it.
- **Video model** — each tile plays a sample clip.
- **Voiceover** — on or off. Pick a voice when it is on.
- **Music** — adds one music track under the whole video.

The cost is next to the button. Press **Generate your video**. The timeline
opens and the clips fill in as they finish.

---

## 5. Edit and export

- **Retry N failed** runs failed clips again.
- You can close the tab during generation. The clips are there when you come
  back.
- Drag to move, drag an edge to trim, `S` to split, `Delete` to remove. These
  are the default **NodeTool** keys. Press `?` to see them and to switch the
  keyboard preset to Premiere Pro or Final Cut Pro.
- Ask the **Editor Assistant**: *"fade out the last clip"*.
- **Export video** saves an MP4 file. **Save as Asset** keeps it in your
  library.

![The timeline editor](assets/screenshots/timeline-editor.png)

Every step is also an agent tool. You can click, chat, or do both. Coding
agents get the same tools over MCP: [NodeTool as an MCP Server](mcp-server.md).

---

## Next

| Want to | Go to |
|---|---|
| Control each shot, stills first | [Creative Agent](creative-agent.md) (the **Storyboard** card) |
| Get good at the timeline | [Video Editor](video-editor.md) |
| Keep a character the same across shots | [Creative Agent → Entities](creative-agent.md) |
| Build a workflow from an empty canvas | [Your First Workflow](first-workflow.md) |
| Build pipelines on a canvas | [Key Concepts](key-concepts.md) |
| Turn a workflow into an app | [Mini Apps](mini-apps.md) |
| Build a game you can play and export | [Game Editor](game-editor.md) |
| Choose models or run them locally | [Models & Providers](models-and-providers.md) |
| Fix something | [Troubleshooting](troubleshooting.md) |
| Look up a word | [Glossary](glossary.md) |

Questions: [Discord](https://discord.gg/WmQTWZRcYE) ·
[GitHub](https://github.com/nodetool-ai/nodetool/issues)
