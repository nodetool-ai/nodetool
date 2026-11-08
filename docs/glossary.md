---
layout: page
title: "Glossary"
description: "Definitions of NodeTool terms: workflow, node, asset, agent, provider, job, and more."
---

Each entry gives a definition, then a technical note where one applies.

---

## Core Concepts

### NodeTool
An open-source workspace where you connect nodes into workflows and use agents to generate media, run models, and build apps.

### Workflow
A collection of connected nodes that you run as one unit.

*Technical: A directed acyclic graph (DAG) of nodes describing an end-to-end task.*

### Node
One step in a workflow that does one job, such as "generate text" or "resize image."

*Technical: A processing unit with typed inputs, outputs, and configurable properties.*

### Edge / Connection
A line from one node's output to another node's input.

### Input
Where data enters – either into a workflow (like uploading a file) or into a specific node (like connecting another node's output).

### Output
Where results come out. Output nodes show your final results. Other nodes have outputs that connect to the next node in the chain.

---

## AI & Models

### Model
A trained AI that a node calls. A language model generates text and an image model creates pictures.

*Example: GPT is a language model, and Stable Diffusion is an image model.*

### Provider
What runs a model. Providers can be:
- **Cloud providers** like OpenAI, Anthropic, or Google
- **Local engines** like Ollama or llama.cpp that run models on your computer

*Technical: Adapter that talks to an external AI service (OpenAI, Anthropic, Gemini, Ollama, ComfyUI, etc.).*

### Agent
An AI that plans and executes multi-step tasks and calls tools.

*Technical: Multi-step planner/executor that can call tools or workflows.*

### LLM (Large Language Model)
A model that understands and generates text. Examples: GPT-4, Claude, Llama.

### Permission Mode
A per-thread setting that controls how far the agent acts without asking: **Plan** (read and propose only), **Default** (ask before actions), or **Auto** (routine work runs unattended, high-risk actions still ask).

### Inference
Running a trained model to produce a result.

---

## User Interface

### Canvas
The main work area where you build workflows by placing and connecting nodes. Pan around by dragging, zoom with scroll.

### Preview Node
A node that displays whatever reaches its input, so you can check intermediate results.

### Mini-App
A form or dashboard that runs a workflow and shows only its inputs and outputs.

### Chat
The agent interface. Chat with a model, run workflows, or let the agent plan and execute multi-step tasks.

### Inspector / Properties Panel
The panel on the right that shows settings for the selected node.

### Workspace
The tabbed surface the app opens on. Every document and app page is a tab in
it. With no tabs open it shows the new-project surface instead.

---

## Running & Execution

### Run
Execute the workflow with the Run button or `Ctrl/⌘+Enter`.

### Job
A single workflow execution that tracks progress and delivers results.

*Technical: A single workflow execution orchestrated by the kernel's `WorkflowRunner`, which runs each node as a `NodeActor`.*

### Streaming
Receiving results as they are generated instead of after the node completes. Many AI nodes stream their output.

### Execution Strategy
Not a setting. The kernel runs every workflow in the server process, with one actor per node and no per-job threads, subprocesses, or containers. The `execution_strategy` field on a job is stored and never read. See [Execution Strategies](execution-strategies.md).

---

## Documents & Editors

### 3D Model
A glTF asset (`.glb` or `.gltf`) that you block out with shapes and lights in the 3D editor and render as a reference image for a shot. See [3D Editor](3d-editor.md).

### App Builder
The **Design** view of an app tab, where you place widgets on a canvas and wire them to workflow inputs and outputs to make a Mini-App. See [App Builder](app-builder.md).

### Clip
One item on a timeline track: imported media, a generated result bound to a workflow, or an authored text, shape, or 3D model item. See [Video Editor](video-editor.md).

### Game
A 2D or 3D game document with scenes, entities, behaviors, and assets, which the built-in engine plays in the editor and exports as a standalone web player. See [Game Editor](game-editor.md).

### JS Script
A saved JavaScript document that runs in the QuickJS sandbox and can call nodes. The Code node uses the same sandbox. See [JS Scripts](js-scripts.md) and [JavaScript Sandbox](javascript-sandbox.md).

### Sketch
A layered image document with blend modes, painting tools, and AI generation onto a layer. See [Sketch Editor](sketch-editor.md).

### Storyboard
The shot-by-shot surface of a video project. It renders cheap stills to choose from before video generation spend. See [AI Video Production](ai-video-production.md).

### Timeline
A multi-track sequence of video, audio, image, overlay, and subtitle clips that you edit, preview, and export. See [Video Editor](video-editor.md).

---

## Agents, Automation & Billing

### Creative Agent
The script-to-screen video pipeline: a Director agent writes the screenplay, the storyboard gates spend shot by shot, and one click assembles the cut into the timeline. See [Creative Agent](creative-agent.md).

### Credit
The unit of NodeTool's hosted balance. Credits are spent only by calls through the `nodetool` provider on the hosted cloud. Calls on your own provider keys never use them. See [Costs and Credits](costs-and-credits.md).

### Director
The agent in the Creative Agent pipeline that turns a brief into a typed screenplay of scenes and shots. See [Creative Agent](creative-agent.md).

### Entity
A reusable character, location, style, or prop that you define once and cast into shots so it stays consistent. See [Entities](entities.md).

### MCP (Model Context Protocol)
An open protocol for giving an agent tools. NodeTool runs as an MCP server, so Claude Code, Codex, Cursor, and other clients can use workflows, assets, and editors. See [MCP Server](mcp-server.md).

### Memory
Short notes that an agent saves in one conversation and recalls in later ones, such as project facts, decisions, and references to assets it made. See [Memory](memory.md).

### Skill
A saved set of instructions for one kind of work. The agent reads its name and description each turn and loads the body when needed or when you pick it with `/`. See [Skills](skills.md).

### Trigger
A node that starts a workflow run on a schedule, a file change, a webhook, or by hand, so you do not press **Run**. See [Triggers](triggers.md).

---

## Infrastructure

### Server
The background process that runs workflows. The desktop app starts one on your machine.

*Technical: Process that runs workflows and exposes HTTP/WebSocket endpoints (via `nodetool serve`, optionally with `--host`, default `127.0.0.1`, and `--port`, default `7777`).*

### API Server
The part of the server that answers requests from the app: saving and loading workflows, starting runs, returning results.

*Technical: Node.js HTTP server (via `@nodetool-ai/websocket`) handling the OpenAI-compatible `/v1/chat/completions` endpoint and REST routes such as `/api/workflows`.*

### Proxy
An optional service in front of NodeTool for routing and TLS in production deployments.

*Technical: Reverse proxy that terminates TLS and forwards to the API server.*

### Thread ID
An identifier that tracks a conversation in Chat. Each chat thread has its own history and context.

*Technical: Conversation identifier for chat/agent sessions; used by WebSocket and SSE streams.*

---

## Data & Storage

### Asset
A file NodeTool stores: an image, audio, video, document, or 3D model. Assets can be reused across workflows, sketches, timelines, and chats.

### Collection
A searchable store of documents used for RAG.

### Vector Database
A special database that stores text as mathematical vectors, enabling semantic search (finding content by meaning, not just keywords).

---

## AI Techniques

### RAG (Retrieval-Augmented Generation)
A model answers using your own documents as context. It retrieves relevant snippets first, then generates an answer from them.

*In NodeTool: Use the Hybrid Search node to retrieve documents, then pass them to an Agent node through a Template node.*

### Embedding
A list of numbers (a vector) that represents text or an image. Similar content has similar vectors, which enables semantic search.

### Prompt
The text instruction sent to a model. Set it as a text input or build it with a Template node that fills variables into a text template.

### Temperature
A setting that controls how varied a model's output is. Low values (0.0–0.3) give consistent output. High values (0.8–1.2) give more varied output.

### Quantization
Reducing the numeric precision of a model's weights to shrink it. A Q4 model uses 4-bit weights (smaller, less accurate) and Q8 uses 8-bit (larger, more accurate). Quantized models fit on hardware with less memory.

### Fine-tuning
The process of further training an existing AI model on your own data to specialize it for a particular task. NodeTool can use fine-tuned models from providers like HuggingFace or OpenAI.

---

## Development Terms

### DAG (Directed Acyclic Graph)
The structure of a workflow. Data flows one way and the graph has no cycles. NodeTool derives the execution order from the connections.

### DSL (Domain Specific Language)
NodeTool's TypeScript API (`@nodetool-ai/dsl`) for building workflows in code. See the [TypeScript DSL guide](developer/ts-dsl-guide.md).

### Node Pack
A bundle of related nodes you install to add capabilities. See [Node Packs](node-packs.md).

### API Key
A secret string that authenticates you with a cloud provider. Create it on the provider's site and enter it in **Settings → Models & Providers**.

### WebSocket
A bidirectional protocol between the frontend and backend that carries streamed workflow results and chat responses.

### SSE (Server-Sent Events)
A one-way HTTP streaming protocol the Server API uses to push workflow progress and results to clients.

---

## See Also

- [Key Concepts](key-concepts.md)
- [Getting Started](getting-started.md)
- [Models & Providers](models-and-providers.md)
