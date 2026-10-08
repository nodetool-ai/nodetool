---
layout: page
title: "Glossary"
description: "NodeTool terminology with plain-English definitions."
---

NodeTool terminology in plain language. Simple explanations followed by technical details where relevant.

---

## Core Concepts

### NodeTool
The platform you're using! NodeTool is a visual environment for building AI workflows. You connect nodes (building blocks) to create automations without writing code.

### Workflow
A **workflow** is your project – a collection of connected nodes that accomplish a task together. Think of it like a recipe: each step (node) does something specific, and together they create the final result.

*Technical: A directed acyclic graph (DAG) of nodes describing an end-to-end task.*

### Node
A **node** is a single building block in your workflow. Each node does one specific job, like "generate text" or "resize image." You connect nodes together to build workflows.

*Technical: A processing unit with typed inputs, outputs, and configurable properties.*

### Edge / Connection
The **lines** that connect nodes together. They show which node's output feeds into another node's input – like pipes carrying water between stations.

### Input
Where data enters – either into a workflow (like uploading a file) or into a specific node (like connecting another node's output).

### Output
Where results come out. Output nodes show your final results; other nodes have outputs that connect to the next node in the chain.

---

## AI & Models

### Model
A pre-trained AI program that has learned to do a specific task. For example, a language model generates text, an image model creates pictures. You don't train models – you just use them.

*Example: GPT is a language model; Stable Diffusion is an image model.*

### Provider
A **service** that runs AI models for you. Providers can be:
- **Cloud providers** like OpenAI, Anthropic, or Google
- **Local engines** like Ollama or llama.cpp that run models on your computer

*Technical: Adapter that talks to an external AI service (OpenAI, Anthropic, Gemini, Ollama, ComfyUI, etc.).*

### Agent
A special type of AI that can **plan and execute** multi-step tasks. Unlike simple chat, an agent can break down complex requests, use tools, and work through problems step by step.

*Technical: Multi-step planner/executor that can call tools or workflows.*

### LLM (Large Language Model)
A type of AI model that understands and generates text. LLMs power chat assistants, writing assistants, and text analysis tools. Examples: GPT-4, Claude, Llama.

### Permission Mode
A per-thread setting that controls how far the agent acts without asking: **Plan** (read and propose only), **Default** (ask before actions), or **Auto** (routine work runs unattended, high-risk actions still ask).

### Inference
The process of using a trained AI model to generate results. When you "run" a model, you're performing inference.

---

## User Interface

### Canvas
The main work area where you build workflows by placing and connecting nodes. Pan around by dragging, zoom with scroll.

### Preview Node
A special node that shows you intermediate results while your workflow runs. Add previews anywhere to debug or monitor progress.

### Mini-App
A simplified interface for running a workflow. Mini-Apps hide the complexity and show only the inputs and outputs, making them easy to share with non-technical users.

### Chat
NodeTool's AI assistant interface. Chat with AI models, run workflows conversationally, or let the agent plan and execute multi-step tasks on its own.

### Inspector / Properties Panel
The panel (usually on the right) that shows settings for the selected node. This is where you configure how each node behaves.

### Workspace
The tabbed surface the app opens on. Every document and app page is a tab in
it; with no tabs open it shows the new-project surface instead.

---

## Running & Execution

### Run
Execute your workflow and see the results. Click the Run button or press `Ctrl/⌘+Enter`.

### Job
A single workflow execution. When you click Run, NodeTool creates a job that tracks progress, handles errors, and delivers results.

*Technical: A single workflow execution orchestrated by the kernel's `WorkflowRunner`, which runs each node as a `NodeActor`.*

### Streaming
Receiving results progressively as they're generated, rather than waiting for everything to complete. Many AI nodes stream their output so you see progress in real-time.

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
The background program that actually runs your workflows. The desktop app starts one on your own machine and talks to it; you never have to think about it unless you're hosting NodeTool for other people.

*Technical: Process that runs workflows and exposes HTTP/WebSocket endpoints (via `nodetool serve`, optionally with `--host`, default `127.0.0.1`, and `--port`, default `7777`).*

### API Server
The part of the server that answers requests from the app: saving and loading workflows, starting runs, returning results.

*Technical: Node.js HTTP server (via `@nodetool-ai/websocket`) handling the OpenAI-compatible `/v1/chat/completions` endpoint and REST routes such as `/api/workflows`.*

### Proxy
An optional service that sits in front of NodeTool to handle security, routing, and SSL certificates for production deployments.

*Technical: Reverse proxy that terminates TLS and forwards to the API server.*

### Thread ID
An identifier that tracks a conversation in Chat. Each chat thread has its own history and context.

*Technical: Conversation identifier for chat/agent sessions; used by WebSocket and SSE streams.*

---

## Data & Storage

### Asset
Any file you use in NodeTool – images, audio, documents, etc. Assets are stored and managed so you can reuse them across workflows.

### Collection
A searchable database of documents used for RAG (Retrieval-Augmented Generation). Collections let AI answer questions using your own documents.

### Vector Database
A special database that stores text as mathematical vectors, enabling semantic search (finding content by meaning, not just keywords).

---

## AI Techniques

### RAG (Retrieval-Augmented Generation)
A technique where an AI model answers questions using your own documents as context. Instead of relying only on its training data, the model retrieves relevant snippets from your documents first, then generates an answer based on that context. This dramatically reduces hallucinations and keeps answers grounded in your data.

*In NodeTool: Use the Hybrid Search node to retrieve documents, then pass them to an Agent node through a Template node.*

### Embedding
A mathematical representation of text (or images) as a list of numbers (a "vector"). Embeddings capture meaning, so similar concepts have similar numbers. This is what makes semantic search possible — finding content by meaning rather than exact keyword matches.

### Prompt
The text instruction you give to an AI model. Good prompts are specific and clear. In NodeTool, prompts are usually set as text inputs or constructed using Template nodes that fill variables into a text template.

### Temperature
A setting that controls how creative or deterministic an AI model's output is. Low temperature (0.0–0.3) produces consistent, factual responses. High temperature (0.8–1.2) produces more varied, creative results.

### Quantization
A technique for making AI models smaller and faster by reducing the precision of their numbers. A Q4 model uses 4-bit precision (smaller, slightly less accurate), while Q8 uses 8-bit (larger, more accurate). Quantized models let you run larger models on less powerful hardware.

### Fine-tuning
The process of further training an existing AI model on your own data to specialize it for a particular task. NodeTool can use fine-tuned models from providers like HuggingFace or OpenAI.

---

## Development Terms

### DAG (Directed Acyclic Graph)
The technical name for how workflows are structured. "Directed" means data flows one way; "Acyclic" means no loops. NodeTool handles this automatically — you just connect nodes and it figures out the execution order.

### DSL (Domain Specific Language)
NodeTool's TypeScript API (`@nodetool-ai/dsl`) for building workflows in code rather than the visual editor. Useful for automation, testing, and custom integrations.

### Node Pack
A collection of related nodes bundled together. Install node packs to add new capabilities to NodeTool (e.g., additional model providers or data processing tools).

### API Key
A secret string that authenticates you with a cloud AI provider. You get API keys from provider dashboards (OpenAI, Anthropic, Google, etc.) and enter them in NodeTool's **Settings → Models & Providers** panel.

### WebSocket
A communication protocol that allows real-time, bidirectional data flow between NodeTool's frontend and backend. This is what enables live streaming of workflow results and chat responses.

### SSE (Server-Sent Events)
A one-way streaming protocol used by NodeTool's Server API to push workflow progress and results to clients in real-time. Similar to WebSocket but simpler and HTTP-based.

---

## See Also

- **[Key Concepts](key-concepts.md)** – Deeper explanation of core ideas
- **[Getting Started](getting-started.md)** – Hands-on tutorial
- **[Models & Providers](models-and-providers.md)** – Setting up AI models
