# TypeScript Backend Packages

**Navigation**: [Root AGENTS.md](../AGENTS.md) | [CLAUDE.md](../CLAUDE.md) → **TypeScript Backend Packages**

The `packages/` directory contains the TypeScript backend — a set of npm workspace packages that implement the NodeTool workflow runtime, API server, CLI, and supporting libraries.

## Package Overview

| Package | Description |
|---------|-------------|
| `@nodetool-ai/protocol` | Shared message types, Zod schemas, protocol definitions |
| `@nodetool-ai/config` | Configuration loading and logging utilities |
| `@nodetool-ai/security` | Secret storage and encryption |
| `@nodetool-ai/auth` | Authentication middleware and utilities |
| `@nodetool-ai/storage` | File storage adapters (local, S3) |
| `@nodetool-ai/models` | Data models via Drizzle ORM — SQLite (local/Electron) and PostgreSQL/Supabase (cloud) |
| `@nodetool-ai/node-sdk` | BaseNode class, NodeRegistry, node authoring API, type system |
| `@nodetool-ai/runtime` | ProcessingContext, LLM providers (Anthropic, OpenAI, Gemini, Ollama, etc.), message queue |
| `@nodetool-ai/kernel` | Workflow graph model, NodeInbox, ActorRuntime, WorkflowRunner |
| `@nodetool-ai/agents` | Planning agent system — TaskPlanner, TaskExecutor, StepExecutor, Tool registry |
| `@nodetool-ai/chat` | Chat message processing and token counting |
| `@nodetool-ai/base-nodes` | Core workflow nodes (text, image, LLM, agents, math, etc.) |
| `@nodetool-ai/fal-nodes` | FAL AI integration nodes |
| `@nodetool-ai/fal-codegen` | Code generator for FAL AI node definitions |
| `@nodetool-ai/replicate-nodes` | Replicate integration nodes |
| `@nodetool-ai/elevenlabs-nodes` | ElevenLabs TTS integration nodes |
| `@nodetool-ai/code-runners` | Secure code execution (Docker + subprocess sandboxing) |
| `@nodetool-ai/huggingface` | HuggingFace model discovery and downloads |
| `@nodetool-ai/vectorstore` | SQLite-vec vector store for RAG |
| `@nodetool-ai/websocket` | Fastify HTTP + WebSocket server (main API, port 7777) |
| `@nodetool-ai/cli` | Command-line interface (`nodetool` command) |
| `@nodetool-ai/deploy` | Cloud deployment utilities |
| `@nodetool-ai/dsl` | Workflow DSL for programmatic workflow creation |

## Build Commands

All packages use TypeScript and are built with `tsc`. The recommended way to build is:

```bash
# From repo root — builds all packages in dependency order (ALWAYS use this)
npm run build:packages

# Build a single package (only when its dependencies are already built)
npm run build --workspace=packages/websocket
```

## Development

```bash
# Start the API server in development mode (tsx --watch, auto-restart)
npm run dev:watch:server

# Start both server and web frontend
npm run dev:watch
npm run dev

# Start backend only
npm run dev:watch:server
npm run dev:server
```

**Important**: The dev server uses `tsx --watch` which runs TypeScript directly. However, `base-nodes`, `node-sdk`, `fal-nodes`, `replicate-nodes`, and `elevenlabs-nodes` use decorators and load from `dist/`. If you change these packages, run `npm run build:packages` first.

## Testing

Each package has its own test suite using **Vitest**:

```bash
# Run tests for all packages
npm run test:packages

# Run tests for a single package
npm run test --workspace=packages/kernel

# Watch mode for a single package
npm run test:watch --workspace=packages/kernel
```

## Package Dependency Order

The packages have a strict dependency hierarchy. Lower packages are dependencies of higher ones:

```
protocol → config → security → auth → storage
                             ↓
                          runtime → kernel → node-sdk → base-nodes
                                          ↓
                                       models → agents → chat
                                                         ↓
                                                      websocket ← cli
```

**This order determines build order.** `npm run build:packages` builds in this order automatically. If you build a single package, its dependencies must already be built.

## Key Packages

### `@nodetool-ai/websocket` — API Server

The main entry point for the backend. Provides:
- REST API endpoints (`/api/workflows`, `/api/jobs`, `/api/assets`, etc.)
- WebSocket endpoint (`/ws`) for streaming workflow execution (MsgPack serialization)
- OpenAI-compatible endpoint (`/v1/chat/completions`)
- MCP server integration
- Health check endpoint (`/health`)

```bash
PORT=7777 HOST=127.0.0.1 node packages/websocket/dist/server.js
```

### `@nodetool-ai/kernel` — Workflow Runtime

Implements the workflow execution engine:
- `WorkflowRunner` — executes workflow graphs
- `NodeInbox` / `ActorRuntime` — actor-model message passing
- Graph traversal and topological ordering

### `@nodetool-ai/runtime` — LLM Providers

Provides adapters for AI providers:
- `AnthropicProvider`, `OpenAIProvider`, `GeminiProvider`
- `OllamaProvider`, `MistralProvider`, `GroqProvider`
- `ClaudeAgentProvider` — Claude Agent SDK integration (uses Claude subscription, not API key)
- `PythonStdioBridge` — calls Python-based nodes (HuggingFace, MLX) via local stdio subprocess
- `ProcessingContext` — execution context with secret resolution

### `@nodetool-ai/agents` — Agent System

Multi-step planning agent with:
- `TaskPlanner` — decomposes objectives into a DAG of Steps
- `TaskExecutor` / `StepExecutor` — walks the DAG with tool-calling loops
- `Tool` base class and registry — 100+ built-in tools
- Skills system — SKILL.md files inject domain-specific instructions
- See [docs/AGENTS.md](../docs/AGENTS.md) for full architecture documentation

### `@nodetool-ai/node-sdk` — Node Authoring

Base classes and registry for building workflow nodes:
- `BaseNode` — abstract base class for all nodes
- `NodeRegistry` — registers and resolves node types
- Type system for node inputs/outputs (connections enforce compatible types)

### `@nodetool-ai/cli` — CLI

The `nodetool` command-line interface. See [CLI documentation](../docs/cli.md).

## Rules

- All packages use ES modules (`"type": "module"` in package.json).
- TypeScript strict mode is enabled in all packages.
- Test files go in `tests/` or `src/__tests__/`.
- Each package exports a clean public API via `src/index.ts`.
- Inter-package imports use workspace references (`@nodetool-ai/...`).
- Never import from `dist/` directories in source code.
- Use Vitest for all package tests (not Jest).
- Throw `Error` objects, not strings. Comment intentionally empty catch blocks.

## Adding a New Package

1. Create directory under `packages/<name>/` with `package.json`, `tsconfig.json`, `src/index.ts`.
2. Set `"name": "@nodetool-ai/<name>"` and `"type": "module"` in package.json.
3. Add the workspace path to the root `package.json` `workspaces` array.
4. Add the build step in the correct position in `npm run build:packages` script (respecting dependency order).
5. Run `npm install` from the repo root to link the workspace.
