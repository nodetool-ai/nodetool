---
layout: page
title: "Chat"
description: "Ask the agent to build workflows and edit your open documents, generate media, and run saved workflows."
---

Chat is where you tell NodeTool what to make. The agent behind it plans, calls tools, builds and edits the document you have open, generates images, video, and speech, and runs your saved workflows, all from one composer. It talks to any configured provider.

---

## Overview

- Builds and edits workflows, sketches, timelines, storyboards, scripts, and mini apps
- Every turn runs the agent loop; the assistant plans and calls tools as a task needs them
- 20+ providers (OpenAI, Anthropic, Gemini, Ollama, …)
- One composer for chat, image, video, and speech generation
- Tools: web search, files, code execution, HTTP, and more
- Permission modes (Plan / Default / Auto) set how much the agent may do without asking
- Run saved workflows from chat
- Multiple threads, persistent history
- Standalone tray window

Persistent WebSocket connection — reconnects after reloads.

---

![Chat Interface](assets/screenshots/global-chat-interface.png)

## Getting Started

### Opening Chat

- **From the App**: Click the **Chats** icon in the left rail, then pick a thread or start a new one
- **Standalone Window**: Click the NodeTool system tray icon and select **Chat** for a dedicated, focused window

### Choosing a Model

![Chat Model Selector](assets/screenshots/chat-model-selector.png)

Click the model chip in the composer to open the model picker. Available models depend on your configured providers:

- **Cloud models** -- OpenAI GPT, Anthropic Claude, Google Gemini (requires API keys)
- **Local models** -- Ollama, LM Studio models (requires local installation)

Configure providers in **Settings > Models & Providers**. See [Models & Providers](models-and-providers.md).

---

## Composer Modes

![Composer Modes](assets/screenshots/chat-composer-modes.png)

The same composer generates more than text. Click the mode chip to switch between:

| Mode | What it does |
|------|--------------|
| **Chat** | Talk to the model, run tools, and drive agents |
| **Generate Images** | Text-to-image with your chosen image model |
| **Edit Images** | Image-to-image edits on a dropped image |
| **Generate Videos** | Text-to-video |
| **Animate Image** | Turn a still image into a clip |
| **Generate Speech** | Text-to-speech with a voice picker |

Each mode swaps in its own controls — resolution, aspect ratio, duration, voice — and attaches them to the message so the server routes to the right provider call.

---

## Mentions: @ for assets and entities

![Entity Mentions](assets/screenshots/chat-mention-entities.png)

Type `@` in the composer to reference things by name instead of hunting for
them:

- **Entities** — characters, locations, styles, and props from your entity
  library appear first. Picking one inlines its name into the message and
  attaches its reference image, so generations stay consistent with the
  entity's canonical look.
- **Assets** — recent and saved library files. Picking one attaches it to the
  message like a drag from the asset library.

The same picker works inside the workflow editor's Prompt node, where a picked
entity becomes a chip that expands to its descriptor and reference image at
generation time.

---

## Conversation Threads

Chat organizes conversations into threads:

- **Create threads** -- Click the **New Chat** button to start a fresh conversation
- **Switch threads** -- Pick a thread from the **Chats** panel in the left rail; it opens as a workspace tab
- **Delete threads** -- Remove conversations you no longer need
- **Message history** -- Scroll through past messages with cursor-based pagination
- **Message caching** -- Recent messages are cached locally for fast loading

Each thread keeps its own model, permission mode, and history.

---

## Agents {#agent-mode}

### The Agent Loop

Every turn in Chat runs the same agent loop — there's no separate mode to turn on. The assistant decides for itself, per request, whether to break a task into steps, select tools, and execute a multi-step plan, or just answer directly.

1. **Planning** -- The agent analyzes your request and, when the task warrants it, creates a plan with ordered steps
2. **Tool selection** -- For each step, the agent chooses from the available tools
3. **Execution** -- Steps run in sequence, with results feeding the next step
4. **Adaptation** -- The agent adjusts its plan based on intermediate results
5. **Reporting** -- Progress, tool calls, and reasoning stream in real time

### Permission Modes

![Permission Modes](assets/screenshots/chat-permission-modes.png)

The permission chip sets how far the agent may act on its own. It's per-thread, so a scratch thread can run wide open while a production one stays cautious:

| Mode | Behavior |
|------|----------|
| **Plan** | Read and propose only. No actions taken. |
| **Default** | Reads run automatically; actions ask first. |
| **Auto** | Everything runs, no prompts. |

### Agent Capabilities

When a request calls for it, the assistant can:

| Capability | Examples |
|------------|---------|
| **Building workflows** | Plan a graph, validate it against the node library, save it, run it, debug what failed |
| **Editing open documents** | Add a node, rewire an edge, add a timeline track, paint a sketch layer, place an app widget |
| **Web research** | Search the web, browse pages, extract content |
| **File operations** | Read, write, and organize files in your workspace |
| **Code execution** | Run JavaScript in a sandboxed environment |
| **Data analysis** | Perform calculations, query vector databases |
| **Document processing** | Extract text from PDFs, process emails |
| **Asset management** | Create, organize, and index assets |
| **HTTP requests** | Call external APIs and process responses |
| **Workflow execution** | Run saved NodeTool workflows with custom inputs |

### Watching an Agent Work

As the agent runs, the thread shows the task plan, each step's status as it starts, completes, or fails, the tools it calls and their results, and — on models that support it — its reasoning.

---

## Building and Editing From Chat

### Building a workflow

Describe what the workflow should do and the agent runs its build loop: plan the
graph, validate it against the node library, save it as a workflow, run it, and
debug whatever failed. The result is a normal workflow in your library, opened
in the editor like any other.

### Editing what you have open

The agent reads the document in front of you and edits it with the same actions
the interface offers. Ask it to add a node, rewire a connection, or explain what
a branch does, and watch the change land on the canvas.

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

Choose a workflow in the composer, or ask for it by name. The agent calls it with
your inputs and streams the results into the thread. Save the workflow in the
[workflow editor](workflow-editor.md) first.

---

## Available Tools

Chat agents have access to these tools:

| Tool Category | What It Does |
|--------------|--------------|
| **Browser** | Navigate web pages, extract content, take screenshots |
| **Search** | Web search via multiple search providers |
| **Filesystem** | Read/write files, list directories, manage workspace |
| **Code** | Execute JavaScript in a sandboxed environment |
| **Calculator** | Perform mathematical calculations |
| **HTTP** | Make HTTP requests to external APIs |
| **PDF** | Extract text and data from PDF documents |
| **Email** | Read and process email messages |
| **Assets** | Upload, organize, and manage NodeTool assets |
| **Vectors** | Query and manage vector database collections |
| **Google** | Interact with Google APIs (search, drive, etc.) |
| **Workspace** | Manage NodeTool workspace settings and files |

### MCP Tools (Model Context Protocol)

NodeTool supports MCP for connecting to external tool servers, so you can integrate custom tools and services beyond the built-in set. See the [MCP documentation](https://modelcontextprotocol.io/) for available MCP servers.

---

## Standalone Chat Window

Access chat in a focused, dedicated window outside the main app:

1. Click the NodeTool icon in your system tray
2. Select **Chat** from the menu
3. A new window opens with just the chat interface

The standalone window is useful for:
- Quick questions without switching to the full app
- Running agents in the background while doing other work
- Using chat as a general-purpose AI assistant

---

## Next Steps

- [Chat & Agents](global-chat-agents.md) -- Agent CLI and API integration
- [Chat API](chat-api.md) -- Programmatic access for running chats
- [Chat CLI](chat-cli.md) -- Command-line chat interface
- [Agent CLI](agent-cli.md) -- Run the agent loop from the terminal
- [Models & Providers](models-and-providers.md) -- Configure AI providers
- [Cookbook](cookbook.md) -- Agent workflow patterns
