---
layout: page
title: "Chat"
description: "Ask the agent to build workflows and edit your open documents, generate media, and run saved workflows."
---

The agent builds and edits the document you have open and runs saved workflows. Type a request and send it.

> **Runs:** locally or cloud, depending on the model you pick. **Needs:** at least one configured provider (see [Providers](providers.md)). Permission modes (Plan, Default, Auto) set what the agent may do without asking.
{: .callout-note}

![Chat Interface](assets/screenshots/global-chat-interface.png)

## Getting Started

### Opening Chat

- **From the App**: Click the **Chats** icon in the left rail, then pick a thread or start a new one
- **Standalone Window**: Click the NodeTool system tray icon and select **Chat** for a dedicated, focused window
- **Chrome Side Panel**: Install the [Chrome extension](chrome-extension.md#chat-in-the-side-panel) and click **Open chat** in its popup. The panel is chat only, but it reads and writes the same threads, and the agent can act on the tab you have open

### Choosing a Model

![Chat Model Selector](assets/screenshots/chat-model-selector.png)

Click the model chip in the composer. The list shows models from your configured providers: cloud models need API keys, local models (Ollama, LM Studio) need the local server. Configure providers in **Settings → Models & Providers**. See [Models & Providers](models-and-providers.md).

---

## Composer Modes

A message sent from the chat page is always a chat turn. To generate media, start a Create tab from **Image**, **Video**, or **Audio** on the home screen. A picture or clip in a chat reply has **Open in Create**, which opens a Create tab with the reply's prompt and media as references.

The chat panel in the workflow editor keeps a mode chip. Click it to switch:

![The mode menu in the workflow editor's chat panel](assets/screenshots/chat-composer-modes.png)

| Mode | What it does |
|------|--------------|
| **Chat** | Talk to the model, run tools, and drive agents |
| **Generate images** | Text-to-image with your chosen image model |
| **Edit images** | Image-to-image edits on a dropped image |
| **Generate videos** | Text-to-video |
| **Animate image** | Turn a still image into a clip |
| **Reference to video** | One clip from several attached images and videos — a character plus a garment, a product plus a location, a clip whose motion the new shot follows |
| **Retake** | Change an attached video |
| **Extend** | Add footage to an attached video |
| **Read aloud** | Text-to-speech with a voice picker |
| **Generate music** | Text-to-music with your chosen music model and a duration |

**Audio to video** and **Motion control** are listed as **Soon** and cannot be picked yet.

Each mode adds its own controls (resolution, aspect ratio, duration, voice) and attaches them to the message so the server routes to the right provider call.

Reference to Video takes every image and video on the message, plus the
reference image of any `@`-mentioned reference, so the prompt describes the action
and the camera rather than the subjects. Its audio chip chooses between what the
model scores and the first reference video's own track; only some models accept
the second, and one that does not rejects the request.

---

## Mentions: @ for assets and references

![Reference Mentions](assets/screenshots/chat-mention-entities.png)

Type `@` in the composer to reference things by name instead of hunting for
them:

- **References** — characters, locations, styles, and props from your reference
  library appear first. Picking one inlines its name into the message and
  attaches its reference image, so generated images and clips keep the
  reference's look.
- **Assets** — recent and saved library files. Picking one attaches it to the
  message like a drag from the asset library.

The same picker works inside the workflow editor's Prompt node, where a picked
reference becomes a chip that expands to its descriptor and reference image at
generation time.

---

## Slash commands: / for skills

Type `/` at the start of a word in the composer to open a list of your skills and the skills NodeTool ships. Picking one inserts `/<skill name> ` into the message so the agent loads that skill for the request. The list filters by skill name and description as you type. See [Skills](skills.md) for how to write one and for the full catalog.

---

## Conversation Threads

**New Chat** starts a thread. Pick one from the **Chats** panel in the left rail to open it as a workspace tab. Each thread keeps its own model, permission mode, and history.

---

## Agents {#agent-mode}

### How the agent works

Per request, the agent either answers directly or breaks the task into a plan, then calls tools step by step. Progress, tool calls, and reasoning stream into the thread as the turn runs.

### Permission Modes

![Permission Modes](assets/screenshots/chat-permission-modes.png)

The permission chip sets how far the agent may act on its own, per thread:

| Mode | Behavior |
|------|----------|
| **Plan** | Read and propose only. No actions taken. |
| **Default** | Reads run automatically; actions ask first. |
| **Auto** | Routine work runs unattended; the agent asks once before an action it declares risky. |

In Plan mode a request that needs several steps comes back as a visual plan of
steps, with the steps that can run in parallel marked. Nothing in it runs. A
question that needs no plan still gets a plain answer.

Switch to Default or Auto and say to run it, and the agent runs that same plan,
not a new one. You are asked once, for the plan as a whole. Steps then appear
as they finish, the parallel ones together. Ask for a change first ("run it
without the last step") and the changed plan is what runs.

In Auto the agent labels every code action it writes `low` or `high` risk. A `low` action — reading, computing, work you asked for and can undo — runs with no prompt. A `high` one — deleting or overwriting something, publishing or sending anything outside the account, spending real money — asks you first, once, showing the program it wants to run. Unlabeled counts as high. "Always allow" stops the asking in every chat.

Every approval card offers **Allow once**, **Always allow** and **Deny**. Always allow saves a rule for that tool, and no chat asks about it again. **Settings › Permissions** lists every tool that can ask, grouped by what it works on, with Always allow or Ask each, so you can take a rule back. Plan mode still blocks every change, whatever the rule.

### Watching an Agent Work

The thread shows the task plan, each step's status, the tools it calls and their results, and, on models that support it, the agent's reasoning.

---

## Building and Editing From Chat

### Building a workflow

The agent plans the graph, validates it against the node library, saves it as a workflow, runs it, and debugs what failed. The result is a normal workflow in your library.

### Editing what you have open

The agent reads the open document and edits it with the same actions the interface offers.

![Workflow assistant panel](assets/screenshots/editor-workflow-assistant.png)

The same holds on every other surface:

| Open document | Ask for |
|---|---|
| Workflow | "Add an upscale step after the image node and preview both." |
| Sketch | "Add a shadow layer at 40% opacity, multiply blend." |
| Timeline | "Put the narration on a new audio track and fade the last clip out." |
| Storyboard | "Render stills for every shot, then clips for the ones I picked." |
| Script | "Voice every draft line with the cast voices and send it to a timeline." |
| Mini app | "Add a tone dropdown and show the result underneath the button." |

Each editor tool names the document it acts on, so a request that targets
something you don't have open comes back saying which documents are.

### Running a saved workflow

Choose a workflow in the composer, or ask for it by name. The agent calls it with your inputs and streams results into the thread. Save the workflow in the [workflow editor](workflow-editor.md) first.

---

## Available Tools

Chat agents have access to these tools:

| Tool Category | What It Does |
|--------------|--------------|
| **Browser** | Navigate web pages, extract content, take screenshots |
| **Search** | Web search via multiple search providers |
| **Filesystem** | Read/write files, list directories, manage workspace |
| **Code** | Execute JavaScript in a sandboxed environment, including calculations |
| **HTTP** | Make HTTP requests to external APIs |
| **PDF** | Extract text and data from PDF documents |
| **Assets** | Upload, organize, and manage NodeTool assets |
| **Vectors** | Query and manage vector database collections |
| **Google** | Search Drive and read and send Gmail, after you connect a Google account. See [Google Workspace](google-workspace.md) |

### Tools from other MCP servers

In the desktop app, add an MCP server in **Settings → Integrations → MCP integration → External servers**, and its tools join the agent's toolbelt on the next message. See [Add other MCP servers to NodeTool](mcp-server.md#add-other-mcp-servers-to-nodetool) for the fields and secrets.

To use NodeTool from another agent instead, see [NodeTool as an MCP Server](mcp-server.md).

---

## Standalone Chat Window

The standalone window shares threads with the main app. See [Opening Chat](#opening-chat).

---

## Related

- [Chat & Agents](global-chat-agents.md)
- [Chat API](chat-api.md)
- [Chat CLI](chat-cli.md)
- [Agent CLI](agent-cli.md)
- [Models & Providers](models-and-providers.md)
- [Cookbook](cookbook.md)
