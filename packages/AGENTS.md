# TypeScript Backend Packages

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **TypeScript Backend Packages**

The `packages/` directory contains the TypeScript backend — a set of npm workspace packages that implement the NodeTool workflow runtime, API server, CLI, and supporting libraries.

## Package Overview

| Package | Description |
|---------|-------------|
| `@nodetool/protocol` | Shared message types and protocol definitions |
| `@nodetool/config` | Configuration loading and logging utilities |
| `@nodetool/security` | Secret storage and encryption |
| `@nodetool/auth` | Authentication middleware and utilities |
| `@nodetool/storage` | File storage adapters (local, S3) |
| `@nodetool/models` | SQLite data models (Workflow, Job, Asset, Secret, etc.) |
| `@nodetool/node-sdk` | BaseNode class, NodeRegistry, and node authoring API |
| `@nodetool/runtime` | ProcessingContext, LLM providers, and message queue |
| `@nodetool/kernel` | Workflow graph model, NodeInbox, and Actor runtime |
| `@nodetool/agents` | Planning agent system for multi-step LLM tasks |
| `@nodetool/chat` | Chat message processing and token counting |
| `@nodetool/base-nodes` | Core workflow nodes (text, image, LLM, etc.) |
| `@nodetool/fal-nodes` | FAL AI integration nodes |
| `@nodetool/fal-codegen` | Code generator for FAL AI node definitions |
| `@nodetool/code-runners` | Secure code execution (Docker + subprocess) |
| `@nodetool/huggingface` | HuggingFace model discovery and downloads |
| `@nodetool/vectorstore` | SQLite-vec vector store for RAG |
| `@nodetool/websocket` | HTTP + WebSocket server (main API server) |
| `@nodetool/cli` | Command-line interface (`nodetool` command) |
| `@nodetool/deploy` | Cloud deployment utilities |

## Build Commands

All packages use TypeScript and are built with `tsc`. The recommended way to build is:

```bash
# From repo root — builds all packages in dependency order
npm run build:packages

# Build a single package
npm run build --workspace=packages/websocket
```

## Development

```bash
# Start the API server in development mode (watches for changes)
npm run dev:server

# Start both server and web frontend
npm run dev
```

## Testing

Each package has its own test suite using Vitest:

```bash
# Run tests for all packages
npm run test:packages

# Run tests for a single package
npm run test --workspace=packages/kernel

# Watch mode
npm run test:watch --workspace=packages/kernel
```

## Package Architecture

### Dependency Order

The packages have a strict dependency hierarchy (lower packages are dependencies of higher ones):

```
protocol → config → security → auth → storage
                              ↓
                           runtime → kernel → node-sdk → base-nodes
                                           ↓
                                        models → agents → chat
                                                          ↓
                                                       websocket ← cli
```

### Key Packages

#### `@nodetool/websocket` — API Server

The main entry point for the backend server. Provides:
- REST API endpoints (`/api/workflows`, `/api/jobs`, `/api/assets`, etc.)
- WebSocket endpoint (`/ws`) for streaming workflow execution
- OpenAI-compatible endpoint (`/v1/chat/completions`)
- MCP server integration
- Health check endpoint (`/health`)

Start it with:
```bash
PORT=7777 HOST=127.0.0.1 node packages/websocket/dist/server.js
```

#### `@nodetool/kernel` — Workflow Runtime

Implements the workflow execution engine:
- `WorkflowRunner` — executes workflow graphs
- `NodeInbox` / `ActorRuntime` — actor-model message passing
- Graph traversal and topological ordering

#### `@nodetool/runtime` — LLM Providers

Provides adapters for AI providers:
- `AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`
- `OllamaProvider`, `MistralProvider`, `GroqProvider`
- `PythonBridge` — calls Python-based nodes (HuggingFace, MLX) via subprocess
- `ProcessingContext` — execution context with secret resolution

#### `@nodetool/node-sdk` — Node Authoring

Base classes and registry for building workflow nodes:
- `BaseNode` — abstract base class for all nodes
- `NodeRegistry` — registers and resolves node types
- Type system for node inputs/outputs

#### `@nodetool/cli` — CLI

The `nodetool` command-line interface. See [CLI documentation](../docs/cli.md).

## Rules

- All packages use ES modules (`"type": "module"` in package.json).
- TypeScript strict mode is enabled in all packages.
- Test files go in `tests/` or `src/__tests__/`.
- Each package exports a clean public API via `src/index.ts`.
- Inter-package imports use workspace references (`@nodetool/...`).
- Never import from `dist/` directories in source code.
