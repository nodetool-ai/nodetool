---
layout: page
title: "Architecture & Lifecycle"
description: "How NodeTool's streaming architecture enables real-time feedback, cancellation, and deployment portability."
---

Three core principles:

1. **Streaming-first execution** — results stream as they generate; long-running jobs can be cancelled.
2. **Unified runtime** — the same workflow JSON runs in the desktop app, headless server, RunPod endpoint, or Cloud Run.
3. **Pluggable execution strategies** — threads (fast iteration), subprocesses (isolation), or Docker (deployment), switchable without changing the workflow.

---

## System Components

NodeTool is organized into distinct packages, each responsible for a specific layer of the system:

### Core Packages

| Package | Purpose |
|---------|---------|
| **@nodetool/kernel** | DAG execution engine -- graph validation, node actors, inbox routing, edge counting |
| **@nodetool/runtime** | Processing context, cache adapters, storage adapters, asset handling |
| **@nodetool/protocol** | Shared message types (JobUpdate, NodeUpdate, EdgeUpdate, TaskUpdate) |
| **@nodetool/agents** | Agent executor, task planner, step executor, multi-mode agent, 20+ tool types |
| **@nodetool/dsl** | TypeScript DSL for building workflows programmatically with type-safe factories |
| **@nodetool/config** | Settings management and environment configuration |

### Infrastructure Packages

| Package | Purpose |
|---------|---------|
| **@nodetool/deploy** | Deployment automation for self-hosted, RunPod, and GCP Cloud Run |
| **@nodetool/storage** | Asset storage backends (local filesystem, S3, Supabase) |
| **@nodetool/vectorstore** | Vector database integration (Chroma) for RAG workflows |
| **@nodetool/cli** | Command-line interface for workflow execution, deployment, and package management |
| **@nodetool/base-nodes** | Core node implementations and dynamic node generation |

### Frontend

| Package | Purpose |
|---------|---------|
| **web** | React application -- workflow editor, asset explorer, model manager, global chat |

---

## Execution Engine

### WorkflowRunner

The `WorkflowRunner` is the DAG orchestrator that executes workflow graphs. It handles:

- **Graph validation** -- Ensures all connections are valid and the graph is acyclic
- **Node actor spawning** -- Creates a `NodeActor` for each node in the graph
- **Input dispatch** -- Routes initial data to the correct input nodes
- **Edge counting and EOS propagation** -- Tracks when nodes have received all inputs and propagates End-Of-Stream signals through the graph
- **Concurrent execution** -- Runs independent nodes in parallel when their inputs are ready

### NodeActor

Each node in a workflow runs as a `NodeActor` with one of four execution modes:

| Mode | Behavior | When to Use |
|------|----------|-------------|
| **Buffered** | Collects all inputs before processing | Default for most nodes. Use when you need all data before you can produce output (e.g., image resize, text formatting). |
| **Streaming input** | Processes inputs as they arrive, one at a time | Use for nodes that handle items in a stream (e.g., filtering, transforming individual items). |
| **Streaming output** | Produces outputs incrementally as they become available | Use for LLMs and generators that emit tokens/chunks over time (e.g., Agent, ListGenerator). |
| **Controlled** | Manages its own execution lifecycle with cached input replay | Use for nodes that need custom control over when and how they process (e.g., loops, conditional retry). |

### Sync Modes

Sync modes determine when a node fires relative to its inputs:

| Sync Mode | Behavior | Example |
|-----------|----------|---------|
| **zip_all** | Wait until **all** inputs have data, then fire with matched sets | A "Combine" node that needs both an image and a caption before it can proceed. |
| **on_any** | Fire when **any** input receives data | A "Logger" node that logs every piece of data passing through, regardless of source. |
| **sticky** | Remember the last value on inputs that haven't changed | A "Style Transfer" node where the style image is set once but content images stream through repeatedly. |

### ProcessingContext

The `ProcessingContext` provides the runtime environment for node execution:

- **Message queue** -- Collects `ProcessingMessage` events for streaming to clients
- **Cache interface** -- Pluggable cache adapters (memory, disk) for intermediate results
- **Asset storage** -- `StorageAdapter` interface supporting local filesystem, S3, or Supabase
- **Asset output modes** -- `data_uri`, `temp_url`, `storage_url`, `workspace`, `raw`
- **User context** -- Authentication tokens, user data, workspace information

---

## Job Lifecycle (run, stream, reconnect, cancel)

{% mermaid %}
sequenceDiagram
    participant Client
    participant API as API Server
    participant JEM as JobExecutionManager
    participant Runner as Execution Strategy
    participant Msg as Messaging/WS

    Client->>API: POST /api/workflows/{id}/run (stream=true)
    API->>JEM: Create job + enqueue
    JEM->>Runner: Start job (threaded/subprocess/docker)
    Runner->>Msg: Emit streaming events
    Msg-->>Client: token/output events
    Client-->>API: reconnect with thread/job id
    API-->>Msg: resume stream from checkpoint
    Client->>API: DELETE /api/workflows/{id}/run (cancel)
    API->>JEM: cancel job
    Runner-->>JEM: teardown and cleanup
    JEM-->>Msg: end event
    Msg-->>Client: completion / cancelled status
{% endmermaid %}

### Message Types

The protocol layer defines several message types for tracking execution state:

| Message | Purpose |
|---------|---------|
| **JobUpdate** | Overall job status (queued, running, completed, failed, cancelled) |
| **NodeUpdate** | Per-node progress (started, output produced, completed, errored) |
| **EdgeUpdate** | Data flowing through connections between nodes |
| **TaskUpdate** | Agent task lifecycle (created, step started/completed/failed, task completed) |

---

## Agent System

NodeTool includes a full agent execution framework for autonomous task completion:

### Components

- **TaskPlanner** -- Breaks complex goals into ordered subtasks with dependencies
- **TaskExecutor** -- Manages the execution of a complete task plan
- **StepExecutor** -- Runs individual steps within a task, including tool calls
- **MultiModeAgent** -- Supports both agent mode (autonomous planning) and direct chat mode

### Available Tools (20+)

Agents can use a wide range of tools during execution:

| Category | Tools |
|----------|-------|
| **Web** | Browser, HTTP requests, web search, Google APIs |
| **Files** | Filesystem operations, workspace management, asset tools |
| **Code** | JavaScript sandbox execution, code analysis |
| **Data** | Calculator, math operations, vector DB queries |
| **Documents** | PDF processing, email integration |
| **AI** | MCP (Model Context Protocol) tools for external service integration |

### Team Collaboration

The agent system supports multi-agent coordination through:
- **Team Executor** -- Orchestrates multiple agents working on related tasks
- **Task Board** -- Message bus for inter-agent communication
- **Edge Message Bus** -- Distributed communication for remote agent setups

---

## Providers

NodeTool supports 20+ AI model providers through a unified provider interface:

| Provider | Types |
|----------|-------|
| **OpenAI** | Text, image, audio, embeddings |
| **Anthropic** | Text (Claude models) |
| **Google Gemini** | Text, image, video, audio |
| **Ollama** | Local LLMs |
| **LM Studio** | Local LLMs |
| **Hugging Face** | All model types |
| **Replicate** | Image, video, audio |
| **FAL** | Image generation |
| **Groq** | Fast text inference |
| **Mistral** | Text generation |
| **Together** | Text, embeddings |
| **Cerebras** | Fast text inference |
| **OpenRouter** | Multi-provider routing |
| **vLLM** | Self-hosted inference |

Each provider implements a base interface that handles authentication, model listing, and inference calls. A built-in cost calculator tracks token usage across providers.

---

## Storage Architecture

NodeTool uses a pluggable storage system with three backends:

| Backend | Use Case | Pros | Cons |
|---------|----------|------|------|
| **Local filesystem** | Desktop app, development | Zero config, fast, private | Single machine only |
| **S3-compatible** | Production (AWS, MinIO) | Scalable, durable, multi-region | Requires cloud account, network latency |
| **Supabase Storage** | Supabase deployments | Integrated auth + storage, managed | Requires Supabase project |

The storage adapter is selected automatically based on environment configuration. Assets are stored in two buckets: `assets` (permanent) and `assets-temp` (intermediate results, auto-cleaned). See [Storage](storage.md) for configuration details.

---

## Python Worker Bridge

Python nodes and Python-only local providers run in a separate worker process. The TS backend spawns the worker with `python -m nodetool.worker --stdio` and communicates over a local stdio protocol:

- binary-safe MessagePack payloads
- 4-byte big-endian length framing
- in-band discovery, execution, status, progress, chunk, and error messages
- structured `load_errors` so import failures are visible without parsing logs

See [Python Bridge Protocol](python-bridge-protocol.md) for the full wire protocol and lifecycle.

## Notes

- All endpoints and examples use `http://127.0.0.1:7777` by default; update host/port when deploying.
- Messaging emits both JSON and optional MessagePack; see [Chat Server](chat-server.md) for protocol details.
- Execution strategies are detailed in [Execution Strategies](execution-strategies.md).

## Related

- [Key Concepts](key-concepts.md) -- High-level overview of workflows, nodes, and models
- [API Reference](api-reference.md) -- REST and WebSocket API documentation
- [Python Bridge Protocol](python-bridge-protocol.md) -- TS ↔ Python worker transport and message schemas
- [Developer Guide](developer/) -- Building custom nodes and extensions
- [Deployment Guide](deployment.md) -- Running NodeTool in production
