---
layout: page
title: "Architecture & Lifecycle"
description: "How NodeTool's streaming architecture enables real-time feedback, cancellation, and deployment portability."
---

Two core principles:

1. **Streaming-first execution** — results stream as they generate; long-running jobs can be cancelled.
2. **Unified runtime** — the same workflow JSON runs in the desktop app, headless server, RunPod endpoint, or Cloud Run.

---

## System Components

NodeTool is organized into distinct packages, each responsible for a specific layer of the system:

### Core Packages

| Package | Purpose |
|---------|---------|
| **@nodetool-ai/kernel** | Workflow execution engine -- graph validation, correlation analysis, node actors, inbox routing, edge counting |
| **@nodetool-ai/runtime** | `ProcessingContext`, model providers, workspace, Python bridge |
| **@nodetool-ai/protocol** | Shared message types and schemas (`job_update`, `node_update`, `edge_update`, `task_update`, and the rest) |
| **@nodetool-ai/node-sdk** | `BaseNode`, the `@prop` decorator, `NodeRegistry`, and the pack loader |
| **@nodetool-ai/agents** | CodeAct sessions, task planner and executors, agent tools and capabilities, the JavaScript sandbox |
| **@nodetool-ai/websocket** | HTTP, WebSocket, and MCP server |
| **@nodetool-ai/dsl** | TypeScript DSL for building workflows programmatically with type-safe factories |
| **@nodetool-ai/config** | Settings management and environment configuration |

### Infrastructure Packages

| Package | Purpose |
|---------|---------|
| **@nodetool-ai/deploy** | Docker image builds and self-hosted server provisioning over SSH |
| **@nodetool-ai/storage** | Asset storage backends (local filesystem, S3, Supabase, in-memory) |
| **@nodetool-ai/vectorstore** | Vector database integration (SQLite-vec, Pinecone, Supabase pgvector) for RAG workflows |
| **@nodetool-ai/cli** | Command-line interface for workflow execution, deployment, and package management |
| **@nodetool-ai/base-nodes** | Compatibility shell that re-exports the domain node packages and registers the built-in packs |

See [Packages](packages.md) for how node packages are structured and registered.

### Frontend

| Package | Purpose |
|---------|---------|
| **web** | React application -- workflow editor, asset explorer, model manager, global chat |
| **electron** | Desktop app that runs the backend and the web UI |
| **mobile** | React Native / Expo app |

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

Each node in a workflow runs as a `NodeActor` with one of four execution modes. Two special cases come first: a trigger node started by a trigger event emits the event payload and completes, and `nodetool.control.Loop` runs in a kernel-owned loop mode. See [Execution Strategies](execution-strategies.md).

| Mode | Behavior | When to Use |
|------|----------|-------------|
| **Buffered** | Collects all inputs before processing | Default for most nodes. Use when you need all data before you can produce output (e.g., image resize, text formatting). |
| **Streaming input** | Processes inputs as they arrive, one at a time | Use for nodes that handle items in a stream (e.g., filtering, transforming individual items). |
| **Streaming output** | Produces outputs incrementally as they become available | Use for LLMs and generators that emit tokens/chunks over time (e.g., Agent, ListGenerator). |
| **Controlled** | Manages its own execution lifecycle with cached input replay | Use for nodes that need custom control over when and how they process (e.g., loops, conditional retry). |

### Correlation-Aware Scheduling

There is no `sync_mode` setting (the old `zip_all`/`on_any`/`sticky` modes were
removed). Instead, the scheduler is **correlation-aware**: every value carries a
correlation lineage describing which iteration/branch it came from, and the
buffered actor path (`_runCorrelated` in `NodeActor`) fires a node once per
*matched set* of correlated inputs.

- Inputs that share a correlation token are matched and processed together —
  this is what the old `zip_all` mode approximated, but it is now driven by the
  actual lineage of each value rather than a static flag.
- Outputs declare how they relate to their inputs via **`outputCorrelation`**
  (`forward`, `iteration`, `chunk`, `aggregate`, `single`), which tells the
  scheduler whether an output is a passthrough, a new per-item iteration, a
  chunk of one logical item, a collapse of a stream, or a one-shot value. Join
  nodes like `Zip` and `Cross` pair values from independent iteration sources
  within their common parent scope.

See [correlation-design.md](https://github.com/nodetool-ai/nodetool/blob/main/docs/correlation-design.md) for the full model.

### ProcessingContext

The `ProcessingContext` provides the runtime environment for node execution:

- **Message queue** -- Collects `ProcessingMessage` events for streaming to clients
- **Cache interface** -- A `CacheAdapter` (`get`, `set`, `has`, `delete`) for intermediate results. The default is the in-memory `MemoryCache`.
- **Asset storage** -- `StorageAdapter` interface supporting local filesystem, S3, or Supabase
- **Workspace** -- `context.workspace` reads and writes the run's files without branching on local or cloud storage
- **Asset output modes** -- `native` (the default), `data_uri`, `temp_url`, `storage_url`, `workspace`, `raw`
- **User context** -- Authentication tokens, user data, workspace information

---

## Job Lifecycle (run, stream, reconnect, cancel)

Workflow execution uses the actor model: `WorkflowRunner` validates the graph,
spawns one `NodeActor` per node, and routes values between actors over inboxes.
Each actor runs in one of the four modes described above (Buffered, Streaming
input, Streaming output, Controlled). The editor runs workflows over the
WebSocket with `run_job`. `POST /api/workflows/{id}/run` is the HTTP route for
agents and the CLI. There is no separate
`JobExecutionManager` class or pluggable threaded/subprocess/docker "execution
strategy" — actors run in-process and stream their results out.

{% mermaid %}
sequenceDiagram
    participant Client
    participant API as API Server
    participant Runner as WorkflowRunner
    participant Actor as NodeActor (per node)
    participant Msg as Messaging/WS

    Client->>API: run_job (WebSocket) or POST /api/workflows/{id}/run
    API->>Runner: Validate graph + spawn actors
    Runner->>Actor: Dispatch inputs, run per execution mode
    Actor->>Msg: Emit streaming events (node/edge updates)
    Msg-->>Client: token/output events
    Client-->>API: reconnect_job with the job id
    API-->>Msg: resume stream
    Client->>API: cancel_job over the WebSocket (or the jobs.cancel tRPC procedure)
    API->>Runner: cancel run
    Runner-->>Actor: teardown and cleanup
    Runner-->>Msg: end event
    Msg-->>Client: completion / cancelled status
{% endmermaid %}

### Message Types

The protocol layer (`packages/protocol/src/messages.ts`) defines the messages a run emits. The main ones:

| Message | Purpose |
|---------|---------|
| **`job_update`** | Overall job status: `queued` (with `queue_position`), `running`, `completed`, `failed`, `cancelled` |
| **`node_update`** | Per-node status: `running`, `completed`, `error`, `warning`, with the node's result or error |
| **`node_progress`** | Progress inside a running node |
| **`edge_update`** | Data flowing through a connection, with a message counter |
| **`output_update`** | A value produced by an output node |
| **`log_update`** | Log lines from a node |
| **`task_update`** | Agent task lifecycle: `task_planned`, `task_created`, `step_started`, `step_completed`, `step_failed`, `task_completed`, `task_failed`, and others |
| **`tool_call_update`** / **`tool_result_update`** | Agent tool calls and their results |

The file also defines `planning_update`, `chunk`, `notification`, `error`, and more. Each message type has a Zod schema.

---

## Agent System

One loop drives every agent. A host (a chat turn, `nodetool agent run`, an MCP client) builds a **CodeAct session** over a gated toolbelt and hands it the user's message. The model acts by writing JavaScript that runs in the QuickJS [sandbox](javascript-sandbox.md). Decomposition is something the model can ask for, not a stage the host imposes.

### Components

- **CodeActExecutor** -- The action loop: one step or one turn of sandboxed JavaScript over the toolbelt
- **TaskPlanner** -- Breaks an objective into tasks with dependencies when the model calls `create_plan`
- **ParallelTaskExecutor** -- Runs a plan's independent tasks concurrently when the model calls `execute_plan`
- **TaskExecutor** -- Walks one task's step DAG in dependency order
- **StepExecutor** -- Runs individual steps, each through a CodeActExecutor
- **SubAgentTool** -- `run_subtask`, `start_subtask`, and `run_search` start a child loop under the parent's budget

Each task's result goes to `context.memory` under `task:<id>`. There is no synthesis stage: the session's next turn reads those results and writes the answer. See [Agent System](https://github.com/nodetool-ai/nodetool/blob/main/docs/AGENTS.md) for the full design.

### Tools

Tools are grouped into capability modules under `packages/agents/src/capabilities/`. Examples: `web`, `browser`, `files`, `assets`, `workflows`, `jobs`, `models`, `collections`, `documents`, `email`, `google`, `memory`, `shared`, `apps`, and `timelines`. The model calls them as imports from `@nodetool-ai/sandbox-nodetool/<namespace>`. External MCP servers add more through the same belt.

---

## Providers

Model providers share one interface (`BaseProvider` in `packages/runtime/src/providers/`). A provider handles authentication, model listing, and inference calls. Which modalities each provider offers (text, image, video, speech, transcription, embeddings, 3D) is in the capability matrix on the [Providers](providers.md) page.

| Kind | Providers |
|------|-----------|
| **Cloud text and multimodal** | OpenAI, Anthropic, Google Gemini, xAI, DeepSeek, Mistral, Groq, Cerebras, Cohere, Alibaba Cloud, GMI Cloud, Moonshot, MiniMax, Together |
| **Media and model hosts** | FAL, Replicate, Hugging Face, Kie.ai, AtlasCloud, ElevenLabs, Topaz, Reve, Higgsfield |
| **Routers** | OpenRouter, Requesty |
| **Local and self-hosted** | Ollama, LM Studio, vLLM, llama.cpp, and Python-bridge providers such as MLX |
| **Agent and OAuth backends** | Claude Agent SDK, Codex |
| **Custom** | OpenAI-compatible endpoints you register |

A built-in cost calculator tracks usage across providers. Credentials resolve from the secret store first, then from environment variables.

---

## Storage Architecture

NodeTool uses a pluggable storage system with three backends. An in-memory adapter also exists for tests:

| Backend | Use Case | Pros | Cons |
|---------|----------|------|------|
| **Local filesystem** | Desktop app, development | Zero config, fast, private | Single machine only |
| **S3-compatible** | Production (AWS, MinIO) | Scalable, durable, multi-region | Requires cloud account, network latency |
| **Supabase Storage** | Supabase deployments | Integrated auth + storage, managed | Requires Supabase project |

`NODETOOL_STORAGE_BACKEND` selects the backend (`file`, `s3`, or `supabase`, default `file`). Assets and temp files use the same backend with separate buckets: `ASSET_BUCKET` for permanent assets and `TEMP_BUCKET` for intermediate results. See [Storage](storage.md) for configuration details.

---

## Python Worker Bridge

Python nodes and Python-only local providers run in a separate worker process. By default the TS backend spawns the worker with `python -m nodetool.worker --stdio` and communicates over a local stdio protocol. When `NODETOOL_WORKER_URL` is set, it connects to a running worker over WebSocket instead:

- binary-safe MessagePack payloads
- 4-byte big-endian length framing on stdio, one frame per message on WebSocket
- in-band discovery, execution, status, progress, chunk, and error messages
- structured `load_errors` so import failures are visible without parsing logs

See [Python Bridge Protocol](python-bridge-protocol.md) for the full wire protocol and lifecycle.

## Notes

- All endpoints and examples use `http://127.0.0.1:7777` by default; update host/port when deploying.
- The WebSocket uses MessagePack by default and can switch to JSON. See [Chat Server](chat-server.md) for protocol details.
- Execution strategies are detailed in [Execution Strategies](execution-strategies.md).

## Related

- [Key Concepts](key-concepts.md) -- High-level overview of workflows, nodes, and models
- [API Reference](api-reference.md) -- REST and WebSocket API documentation
- [Python Bridge Protocol](python-bridge-protocol.md) -- TS ↔ Python worker transport and message schemas
- [Developer Guide](developer/) -- Building custom nodes and extensions
- [Deployment Guide](deployment.md) -- Running NodeTool in production
