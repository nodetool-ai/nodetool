# NodeTool

Visual AI workflow platform. TypeScript monorepo with React frontend, Electron desktop app, and Node.js backend.

## Critical Commands

```bash
# After ANY code change, run all three:
make typecheck   # Type check all packages (web, electron, mobile)
make lint        # Lint all packages
make test        # Run all tests (web, electron, mobile)

# Combined check (runs all three above):
make check
```

### Package-Specific Commands

```bash
# Backend packages (in packages/)
npm run build:packages                          # Build all in dependency order
npm run test --workspace=packages/<name>        # Test single package
npm run test:watch --workspace=packages/<name>  # Watch mode

# Web (in web/)
cd web && npm test              # Tests
cd web && npm run typecheck     # Type check
cd web && npm run lint          # Lint
cd web && npm start             # Dev server on :3000

# Electron (in electron/)
cd electron && npm test         # Tests
cd electron && npm run typecheck
cd electron && npm run lint

# Dev servers
make dev          # Backend (tsx --watch) + web Vite server
make dev-server   # Backend only
make electron-dev # Electron dev (auto-rebuilds native modules)
```

### Prerequisites

- **Node.js 24.x** (required — see `.nvmrc`). Use `nvm use` to activate.
- npm (comes with Node)
- Python 3.11+ with conda (optional, for Python nodes)

```bash
# First-time setup
nvm use              # Reads .nvmrc, activates Node 24
npm install          # Install all workspace dependencies
npm run build:packages  # Build backend packages
```

## Architecture

```
packages/           # 24 npm workspace packages (TypeScript backend)
  protocol/         # Shared message types — base dependency for everything
  config/           # Configuration loading, logging
  security/         # Secret storage, encryption
  auth/             # Authentication middleware
  storage/          # File storage (local, S3)
  models/           # SQLite data models (Drizzle ORM)
  node-sdk/         # BaseNode class, NodeRegistry, type system
  runtime/          # ProcessingContext, LLM providers, message queue
  kernel/           # Workflow graph, Actor runtime, WorkflowRunner
  agents/           # Planning agent system (TaskPlanner → TaskExecutor → StepExecutor)
  chat/             # Chat message processing, token counting
  base-nodes/       # Core workflow nodes (text, image, LLM, agents)
  code-runners/     # Secure code execution (Docker, subprocess)
  websocket/        # Fastify HTTP + WebSocket server (main API, port 7777)
  cli/              # nodetool CLI
  vectorstore/      # SQLite-vec for RAG
  ...

web/                # React 18 + Vite + MUI + Zustand + ReactFlow
electron/           # Electron 39 desktop app
mobile/             # React Native / Expo
```

### Package Dependency Order

```
protocol → config → security → auth → storage
                             ↓
                          runtime → kernel → node-sdk → base-nodes
                                          ↓
                                       models → agents → chat
                                                         ↓
                                                      websocket ← cli
```

### Key Patterns

- **State management**: Zustand stores (web/src/stores/), React Context wraps Zustand, TanStack Query for server state
- **UI Primitives (MANDATORY)**: All frontend UI must use primitives from `web/src/components/ui_primitives/`. **Never import raw MUI components** (`Typography`, `Button`, `IconButton`, `Tooltip`, `CircularProgress`, `Chip`, `Dialog`, `Alert`, `Divider`, `Paper`, etc.) outside of `ui_primitives/` or `editor_ui/`. See the **[Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md)** for the decision tree, migration rules, and full catalog of 90+ primitives. When touching any file, migrate raw MUI usage to primitives.
- **Styling**: MUI v7 + `sx` prop for one-off, `styled()` for reusable. Theme values only, no hardcoded colors/spacing. No inline `display: "flex"` — use `FlexRow`/`FlexColumn` layout primitives instead.
- **Node graph**: ReactFlow 12. Nodes extend `BaseNode` from `@nodetool/node-sdk`.
- **LLM providers**: All in `packages/runtime/src/providers/` — Anthropic, OpenAI, Gemini, Ollama, Mistral, Groq, Claude Agent SDK
- **Agent system**: `packages/agents/` — full planning agent (TaskPlanner → DAG of Steps), SimpleAgent (single-step), AgentExecutor (value extraction)
- **Workflow execution**: Actor-model in `packages/kernel/` — DAG-based, message-passing between node actors
- **Python bridge**: `PythonStdioBridge` in `packages/runtime/` — spawns `python -m nodetool.worker --stdio`, communicates via length-prefixed msgpack over stdin/stdout. Lazy-connected on first workflow with Python nodes.
- **Serialization**: MsgPack for WebSocket messages, JSON for REST API
- **ES Modules**: All packages use `"type": "module"`. Imports need `.js` extension in compiled output.

## Pre-Commit

Before every commit, run lint and typecheck. Do not commit if either fails.

```bash
make lint        # Must pass before committing
make typecheck   # Must pass before committing
```

## Rules

- TypeScript strict mode. No `any`. Use `const` by default.
- Functional React components only. Typed props interfaces.
- Zustand selectors always — never subscribe to entire store.
- `shallow` equality for multi-value Zustand selections.
- Tests in `__tests__/` directories. Use Vitest (packages), Jest (web/electron).
- React Testing Library: `getByRole`/`getByLabelText`, `userEvent`, `waitFor`.
- TanStack Query for all server state. Hierarchical keys. `enabled` for conditional queries.
- Frontend tools prefixed `ui_` (e.g., `ui_add_node`).
- All inter-package imports use `@nodetool/<package>`. Never import from `dist/`.
- Throw `Error` objects, not strings. Comment intentionally empty catch blocks.

## Common Pitfalls

- **Node.js 24.x is required**. Electron 39 embeds Node 24 — native modules (better-sqlite3) must be compiled against the same ABI. Use `nvm use 24` (see `.nvmrc`). Mismatched major versions will cause `NODE_MODULE_VERSION` errors in Electron.
- **base-nodes, node-sdk, fal-nodes, replicate-nodes, elevenlabs-nodes** use decorators and load from `dist/`. After changing these, run `npm run build:packages` before `make dev`.
- **Package build order matters**. Use `npm run build:packages` which builds in dependency order, not `npm run build` on individual packages that have unbuilt dependencies.
- **WebSocket messages use MsgPack**, not JSON. Use the existing serialization helpers.
- **Don't create new WebSocket instances** — use `GlobalWebSocketManager` singleton.
- **Mobile typecheck** requires building protocol first: `cd packages/protocol && npm run build`.
- **Native module ABI mismatch**: If you see `NODE_MODULE_VERSION` errors in Electron dev mode, run `make electron-dev` which automatically rebuilds native modules (better-sqlite3, bufferutil) against Electron's ABI via node-gyp. Do NOT use `npm rebuild` or `electron-builder install-app-deps` — these rebuild for system Node, not Electron's embedded Node.
- **Claude Agent Provider in nested sessions (e.g. Claude Code web)**: The SDK spawns a subprocess via `node cli.js`. In environments like Claude Code on the web (`claude.ai/code`), you must: (1) strip all `CLAUDE_CODE_*` / `CLAUDE_SESSION_*` / `CLAUDE_ENABLE_*` / `CLAUDE_AFTER_*` / `CLAUDE_AUTO_*` env vars — not just `CLAUDECODE`; (2) run as a non-root user — the SDK refuses `--dangerously-skip-permissions` when uid=0; (3) keep `ANTHROPIC_BASE_URL` and `HTTP_PROXY`/`HTTPS_PROXY` vars for API routing. See `docs/AGENTS.md` § Claude Agent SDK for full details.

## CLI

Two entry points: `nodetool` (management commands) and `nodetool-chat` (interactive chat).

```bash
# From source (no build needed — uses tsx):
npm run dev:nodetool -- <command>       # nodetool commands
npm run dev:chat -- [flags]             # interactive chat

# From built dist (requires npm run build:packages):
npm run nodetool -- <command>
npm run chat -- [flags]
```

### nodetool chat (Agent Mode)

```bash
# Interactive agent chat
npm run dev:chat -- --agent --provider openai --model gpt-5.4-mini
npm run dev:chat -- --agent --provider anthropic --model claude-sonnet-4-6

# Piped input (non-interactive)
echo "research 5 AI topics" | npm run dev:chat -- --agent --provider openai --model gpt-5.4-mini

# Connect to running WebSocket server
npm run dev:chat -- --agent --url ws://localhost:7777/ws
```

Chat flags:
```
-a, --agent              Enable agent mode (planning + parallel execution)
--no-agent               Disable agent mode
-p, --provider <name>    anthropic, openai, ollama, gemini, mistral, groq
-m, --model <id>         Model ID (e.g. claude-sonnet-4-6, gpt-5.4-mini)
-w, --workspace <path>   Workspace directory for file tools
--tools <list>           Comma-separated tool names
-u, --url <ws-url>       Connect to WebSocket server instead of local provider
```

Interactive commands: `/agent` toggle, `/model <id>`, `/provider <name>`, `/tools`, `/clear`, `/exit`

### nodetool serve

```bash
npm run dev:nodetool -- serve                     # Start on localhost:7777
npm run dev:nodetool -- serve --host 0.0.0.0      # Bind all interfaces
npm run dev:nodetool -- serve --port 8080          # Custom port
```

### nodetool run (DSL Workflows)

```bash
npm run dev:nodetool -- run workflow.ts            # Run a TypeScript DSL file
npm run dev:nodetool -- run workflow.ts --json     # Output results as JSON
```

### nodetool workflows

Requires a running server (localhost:7777 or `--api-url`).

```bash
npm run dev:nodetool -- workflows list                          # List all workflows
npm run dev:nodetool -- workflows list --json                   # JSON output
npm run dev:nodetool -- workflows get <workflow_id>             # Get workflow details
npm run dev:nodetool -- workflows get <id> --json               # JSON output

# Run workflow by ID (uses local DB), JSON file, or DSL file
npm run dev:nodetool -- workflows run <workflow_id>
npm run dev:nodetool -- workflows run <workflow_id> --params '{"key": "value"}'
npm run dev:nodetool -- workflows run workflow.json
npm run dev:nodetool -- workflows run workflow.ts
npm run dev:nodetool -- workflows run <id> --json               # JSON output

# Export workflow as TypeScript DSL
npm run dev:nodetool -- workflows export-dsl <workflow_id>
npm run dev:nodetool -- workflows export-dsl <id> -o output.ts  # Write to file
npm run dev:nodetool -- workflows export-dsl workflow.json       # From JSON file
```

### nodetool jobs

```bash
npm run dev:nodetool -- jobs list                               # List jobs
npm run dev:nodetool -- jobs list --workflow-id <id>             # Filter by workflow
npm run dev:nodetool -- jobs get <job_id>                        # Job details
npm run dev:nodetool -- jobs get <job_id> --json
```

### nodetool assets

```bash
npm run dev:nodetool -- assets list                             # List assets
npm run dev:nodetool -- assets list --query "photo"             # Search
npm run dev:nodetool -- assets list --content-type image/png    # Filter by type
npm run dev:nodetool -- assets get <asset_id>                   # Asset details
```

### nodetool secrets

```bash
npm run dev:nodetool -- secrets list                            # List secret keys
npm run dev:nodetool -- secrets store OPENAI_API_KEY            # Store (prompts for value)
npm run dev:nodetool -- secrets store MY_KEY --description "..."
npm run dev:nodetool -- secrets get OPENAI_API_KEY              # Print value
```

### nodetool settings & info

```bash
npm run dev:nodetool -- settings show                           # Show env config
npm run dev:nodetool -- settings show --json
npm run dev:nodetool -- info                                    # System info, API key status
npm run dev:nodetool -- info --json
```

### Global Options

Most server-calling commands accept `--api-url <url>` (default: `http://localhost:7777`, env: `NODETOOL_API_URL`).

### Observing Agent Execution

```bash
# Debug logging (all LLM calls, planning details)
NODETOOL_LOG_LEVEL=debug npm run dev:chat -- --agent

# OpenTelemetry tracing to console
OTEL_TRACES_EXPORTER=console TRACELOOP_DISABLE_BATCH=true npm run dev:chat -- --agent

# Traceloop cloud
TRACELOOP_API_KEY=your-key npm run dev:chat -- --agent

# Custom OTLP backend (Jaeger, Grafana)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 npm run dev:chat -- --agent
```

See [packages/agents/CLAUDE.md](packages/agents/CLAUDE.md) for agent architecture, parallel execution, skills, and tuning.

## Detailed Guidelines

See the AGENTS.md hierarchy for detailed coding rules per area:
- [Root rules](AGENTS.md) — TypeScript, React, Zustand, MUI, testing rules
- [Backend packages](packages/AGENTS.md) — Package architecture, dependency order
- [Web UI](web/src/AGENTS.md) — Components, stores, hooks, contexts, server state
- [Electron](electron/src/AGENTS.md) — Security, IPC, platform code
- [Agent system](docs/AGENTS.md) — Planning, execution, tools, skills, workflow nodes
- [UI Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md) — Primitives-first policy, decision tree, migration rules
