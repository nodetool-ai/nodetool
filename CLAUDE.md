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
electron/           # Electron 35 desktop app
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
- **Styling**: MUI v7 + `sx` prop for one-off, `styled()` for reusable. Theme values only, no hardcoded colors/spacing.
- **Node graph**: ReactFlow 12. Nodes extend `BaseNode` from `@nodetool/node-sdk`.
- **LLM providers**: All in `packages/runtime/src/providers/` — Anthropic, OpenAI, Gemini, Ollama, Mistral, Groq, Claude Agent SDK
- **Agent system**: `packages/agents/` — full planning agent (TaskPlanner → DAG of Steps), SimpleAgent (single-step), AgentExecutor (value extraction)
- **Workflow execution**: Actor-model in `packages/kernel/` — DAG-based, message-passing between node actors
- **Python bridge**: `PythonStdioBridge` in `packages/runtime/` — spawns `python -m nodetool.worker --stdio`, communicates via length-prefixed msgpack over stdin/stdout. Lazy-connected on first workflow with Python nodes.
- **Serialization**: MsgPack for WebSocket messages, JSON for REST API
- **ES Modules**: All packages use `"type": "module"`. Imports need `.js` extension in compiled output.

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

- **base-nodes, node-sdk, fal-nodes, replicate-nodes, elevenlabs-nodes** use decorators and load from `dist/`. After changing these, run `npm run build:packages` before `make dev`.
- **Package build order matters**. Use `npm run build:packages` which builds in dependency order, not `npm run build` on individual packages that have unbuilt dependencies.
- **WebSocket messages use MsgPack**, not JSON. Use the existing serialization helpers.
- **Don't create new WebSocket instances** — use `GlobalWebSocketManager` singleton.
- **Mobile typecheck** requires building protocol first: `cd packages/protocol && npm run build`.

## Detailed Guidelines

See the AGENTS.md hierarchy for detailed coding rules per area:
- [Root rules](AGENTS.md) — TypeScript, React, Zustand, MUI, testing rules
- [Backend packages](packages/AGENTS.md) — Package architecture, dependency order
- [Web UI](web/src/AGENTS.md) — Components, stores, hooks, contexts, server state
- [Electron](electron/src/AGENTS.md) — Security, IPC, platform code
- [Agent system](docs/AGENTS.md) — Planning, execution, tools, skills, workflow nodes
