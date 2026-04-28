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
A type of AI model that understands and generates text. LLMs power chatbots, writing assistants, and text analysis tools. Examples: GPT-4, Claude, Llama.

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

### Global Chat
NodeTool's AI assistant interface. Chat with AI models, run workflows conversationally, or enable Agent Mode for autonomous task completion.

### Inspector / Properties Panel
The panel (usually on the right) that shows settings for the selected node. This is where you configure how each node behaves.

### Dashboard
Your home screen showing recent workflows, templates, and chat threads.

---

## Running & Execution

### Run
Execute your workflow and see the results. Click the Run button or press `Ctrl/⌘+Enter`.

### Job
A single workflow execution. When you click Run, NodeTool creates a job that tracks progress, handles errors, and delivers results.

*Technical: A single workflow execution instance managed by JobExecutionManager.*

### Streaming
Receiving results progressively as they're generated, rather than waiting for everything to complete. Many AI nodes stream their output so you see progress in real-time.

### Execution Strategy
How NodeTool runs your workflow – either in the same process, a separate subprocess, or inside a Docker container.

*Technical options: threaded, subprocess, Docker.*

---

## Infrastructure

### Server
The background process that actually runs your workflows. Servers connect to the server and execute jobs.

*Technical: Process that runs workflows and exposes HTTP/WebSocket endpoints (often via `nodetool serve` or `nodetool serve --mode private`).*

### API Server
The backend service that handles requests, manages workflows, and coordinates servers.

*Technical: Node.js HTTP server (via `@nodetool-ai/websocket`) handling REST endpoints such as `/v1/chat/completions` and `/api/workflows`.*

### Proxy
An optional service that sits in front of NodeTool to handle security, routing, and SSL certificates for production deployments.

*Technical: Reverse proxy that terminates TLS and forwards to the API server.*

### Thread ID
An identifier that tracks a conversation in Global Chat. Each chat thread has its own history and context.

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

*In NodeTool: Use the HybridSearch node to retrieve documents, then pass them to an Agent node via FormatText.*

### Embedding
A mathematical representation of text (or images) as a list of numbers (a "vector"). Embeddings capture meaning, so similar concepts have similar numbers. This is what makes semantic search possible — finding content by meaning rather than exact keyword matches.

### Prompt
The text instruction you give to an AI model. Good prompts are specific and clear. In NodeTool, prompts are usually set as text inputs or constructed using FormatText nodes that combine variables into a template.

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
A secret string that authenticates you with a cloud AI provider. You get API keys from provider dashboards (OpenAI, Anthropic, Google, etc.) and enter them in NodeTool's **Settings → Providers** panel.

### WebSocket
A communication protocol that allows real-time, bidirectional data flow between NodeTool's frontend and backend. This is what enables live streaming of workflow results and chat responses.

### SSE (Server-Sent Events)
A one-way streaming protocol used by NodeTool's Server API to push workflow progress and results to clients in real-time. Similar to WebSocket but simpler and HTTP-based.

---

## See Also

- **[Key Concepts](key-concepts.md)** – Deeper explanation of core ideas
- **[Getting Started](getting-started.md)** – Hands-on tutorial
- **[Models & Providers](models-and-providers.md)** – Setting up AI models
