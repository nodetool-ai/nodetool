# Architecture

This document describes the architecture of NodeTool — a visual AI workflow platform that runs across desktop, web, and mobile. It covers both the TypeScript backend (the `packages/` monorepo) and the React frontend (the `web/` application), along with the Electron desktop shell and React Native mobile app.

---

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Repository Layout](#repository-layout)
- [Design Principles](#design-principles)
- [Backend Architecture](#backend-architecture)
  - [Package Dependency Graph](#package-dependency-graph)
  - [Foundational Layer](#foundational-layer)
  - [Infrastructure Layer](#infrastructure-layer)
  - [Domain Layer](#domain-layer)
  - [Feature Layer](#feature-layer)
  - [Application Layer](#application-layer)
  - [Workflow Execution Pipeline](#workflow-execution-pipeline)
  - [Agent System](#agent-system)
  - [Node System](#node-system)
- [Frontend Architecture](#frontend-architecture)
  - [Technology Stack](#technology-stack)
  - [Application Shell & Routing](#application-shell--routing)
  - [State Management](#state-management)
  - [Component Architecture](#component-architecture)
  - [WebSocket Communication](#websocket-communication)
  - [API Client](#api-client)
  - [Code Splitting & Performance](#code-splitting--performance)
- [Electron Desktop App](#electron-desktop-app)
- [Mobile App](#mobile-app)
- [Communication Protocols](#communication-protocols)
- [Data Flow Examples](#data-flow-examples)
  - [Workflow Execution](#workflow-execution)
  - [Chat / Agent Interaction](#chat--agent-interaction)
- [Storage & Persistence](#storage--persistence)
- [Authentication](#authentication)
- [Deployment](#deployment)
- [Build System](#build-system)
- [Testing Strategy](#testing-strategy)

---

## High-Level Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                          Clients                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │  Web UI  │   │ Electron │   │  Mobile  │   │   CLI    │     │
│  │ (React)  │   │ (Desktop)│   │ (Expo)   │   │  (Ink)   │     │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘     │
│       │              │              │              │             │
│       └──────────────┴──────┬───────┴──────────────┘             │
│                             │                                    │
│                     HTTP + WebSocket                             │
│                             │                                    │
├─────────────────────────────┼────────────────────────────────────┤
│                       Backend Server                             │
│                             │                                    │
│  ┌──────────────────────────┴──────────────────────────────┐     │
│  │              WebSocket + HTTP Server                     │     │
│  │           (packages/websocket)                          │     │
│  └──────┬────────────┬────────────┬────────────┬───────────┘     │
│         │            │            │            │                 │
│  ┌──────┴──┐  ┌──────┴──┐  ┌─────┴────┐ ┌────┴─────┐           │
│  │ Kernel  │  │ Agents  │  │  Models  │ │  Auth    │           │
│  │ (DAG    │  │ (LLM    │  │ (SQLite  │ │ (JWT     │           │
│  │ Runner) │  │ Tasks)  │  │ + ORM)   │ │ Tokens)  │           │
│  └────┬────┘  └────┬────┘  └──────────┘ └──────────┘           │
│       │            │                                            │
│  ┌────┴────┐  ┌────┴────────────────────────────────────┐       │
│  │Node SDK │  │  Tools (100+)                           │       │
│  │+ Nodes  │  │  Search, Code, File, Browser, PDF, ...  │       │
│  └────┬────┘  └─────────────────────────────────────────┘       │
│       │                                                         │
│  ┌────┴────────────────────────────────────────────────┐        │
│  │  Runtime  │  Protocol  │  Config  │  Security       │        │
│  │  Storage  │  VectorDB  │  Code Runners              │        │
│  └─────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Repository Layout

```
nodetool/
├── packages/               # TypeScript backend monorepo (26 packages)
│   ├── protocol/           #   Shared types & message definitions (Zod)
│   ├── config/             #   Environment & settings management
│   ├── security/           #   Encryption, secrets, master key
│   ├── auth/               #   JWT authentication & user management
│   ├── storage/            #   Pluggable asset storage (file, S3, Supabase)
│   ├── models/             #   Database models (SQLite + Drizzle ORM)
│   ├── runtime/            #   Processing context & LLM providers
│   ├── kernel/             #   DAG orchestration & workflow runner
│   ├── node-sdk/           #   BaseNode class & node registry
│   ├── base-nodes/         #   100+ built-in node types
│   ├── agents/             #   Agent system with task planning & tools
│   ├── chat/               #   Chat protocol & runtime integration
│   ├── vectorstore/        #   SQLite-vec vector database
│   ├── code-runners/       #   Sandboxed code execution (Docker/subprocess)
│   ├── dsl/                #   Type-safe workflow DSL
│   ├── websocket/          #   HTTP + WebSocket server (entry point)
│   ├── cli/                #   Terminal UI (React + Ink)
│   ├── deploy/             #   Deployment utilities (Docker, SSH, RunPod, GCP)
│   ├── huggingface/        #   HuggingFace model discovery & cache
│   ├── replicate-nodes/    #   Replicate AI integration nodes
│   ├── replicate-codegen/  #   Code generator for Replicate nodes
│   ├── fal-nodes/          #   FAL AI integration nodes
│   ├── fal-codegen/        #   Code generator for FAL nodes
│   └── elevenlabs-nodes/   #   ElevenLabs voice synthesis nodes
├── web/                    # React web application (Vite + MUI)
├── electron/               # Electron desktop shell
├── mobile/                 # React Native mobile app (Expo)
├── docs/                   # Jekyll documentation site
├── scripts/                # Build, release, and dev helper scripts
├── workflow_runner/        # Standalone workflow execution utilities
├── examples/               # Example workflows
├── Makefile                # Top-level build/test/lint commands
├── package.json            # npm workspace configuration
└── tsconfig.base.json      # Shared TypeScript configuration
```

---

## Design Principles

1. **Streaming-first execution** — Results are streamed to clients as they are produced. Workflows, chat, and agent tasks all emit incremental updates over WebSocket so users see progress in real time and can cancel at any point.

2. **Unified runtime** — The same workflow JSON graph runs identically on desktop (Electron), headless server, RunPod GPU cloud, or Google Cloud Run. No platform-specific code is required.

3. **Pluggable execution strategies** — Nodes can run in-process (fast iteration), in subprocesses (isolation), or in Docker containers (deployment). The strategy is chosen at runtime without changing the workflow definition.

4. **Layered package architecture** — Packages are organized into layers (foundational → infrastructure → domain → feature → application) with strict dependency direction. Lower layers never import from higher layers.

5. **Type safety end-to-end** — The protocol package defines Zod schemas shared between backend and frontend. The API client is generated from OpenAPI specs. TypeScript strict mode is enforced across all packages.

---

## Backend Architecture

The backend is a TypeScript monorepo of 26 npm workspace packages. Each package has a focused responsibility and explicit dependencies.

### Package Dependency Graph

```
Application Layer
  └── websocket ─────────────────────────── Server entry point
  └── cli ───────────────────────────────── Terminal UI
  └── deploy ────────────────────────────── Deployment tooling

Feature Layer
  ├── base-nodes ────────────────────────── Built-in node types
  ├── dsl ───────────────────────────────── Workflow DSL
  ├── replicate-nodes, fal-nodes ────────── Provider integrations
  ├── elevenlabs-nodes ──────────────────── Voice synthesis
  ├── huggingface ───────────────────────── Model discovery
  └── chat ──────────────────────────────── Chat protocol

Domain Layer
  ├── kernel ────────────────────────────── DAG runner & actors
  ├── node-sdk ──────────────────────────── Node framework
  ├── agents ────────────────────────────── Agent task planning
  └── models ────────────────────────────── Database persistence

Infrastructure Layer
  ├── runtime ───────────────────────────── Processing context
  ├── vectorstore ───────────────────────── Vector search
  └── security ──────────────────────────── Encryption & secrets

Foundational Layer
  ├── protocol ──────────────────────────── Types & messages (Zod)
  ├── config ────────────────────────────── Environment management
  ├── storage ───────────────────────────── Asset storage adapters
  ├── auth ──────────────────────────────── Authentication providers
  └── code-runners ──────────────────────── Sandboxed code execution
```

### Foundational Layer

These packages have no internal dependencies and form the base of the stack.

**`protocol`** — Defines all shared types using Zod schemas: `ProcessingMessage`, `NodeDescriptor`, `Edge`, `JobUpdate`, `NodeUpdate`, `OutputUpdate`, and asset reference types (`ImageRef`, `AudioRef`, `VideoRef`). Provides `TypeMetadata` for complex type parsing (e.g., `list[dict[str, int]]`), JSON schema generation for tool definitions, and type validation/coercion utilities.

**`config`** — Environment and settings management built on dotenv. Exports `loadEnvironment()`, `getEnv()`, `requireEnv()` for environment variables, `registerSetting()`/`getSettings()` for a typed settings registry, `createLogger()` using pino for structured logging, and `diagnoseEnvironment()` for startup validation.

**`storage`** — Pluggable asset storage with a shared `AbstractStorage` interface (`store`, `retrieve`, `exists`). Four backend implementations: `FileStorage` (local filesystem), `MemoryStorage` (tests), `S3Storage` (AWS S3 via dynamic import), and `SupabaseStorage` (Supabase cloud). SDKs are loaded lazily to keep them as optional runtime-only dependencies.

**`auth`** — JWT-based authentication with multiple provider implementations: `LocalAuthProvider` (file-based users), `StaticTokenProvider` (fixed tokens), `MultiUserAuthProvider`, and `SupabaseAuthProvider`. Provides middleware (`createAuthMiddleware`), token extraction, and a `UserManager` abstraction with role-based access control.

**`code-runners`** — Sandboxed code execution for Python, JavaScript, Bash, Ruby, and Lua. Supports subprocess-based and Docker container-based runners with streaming stdout/stderr capture.

### Infrastructure Layer

Built on top of the foundational packages.

**`runtime`** — The central `ProcessingContext` class that every node receives during execution. It provides a message queue for emitting `ProcessingMessage` events, cache adapter interface (get/set with TTL), storage adapter interface for assets, and LLM provider abstractions (`BaseProvider`) for OpenAI, Anthropic, Gemini, and others. Also includes `StreamingInputs`/`StreamingOutputs` types, a Python bridge for interop with Python nodes, and OpenTelemetry tracing.

**`security`** — Cryptography and secret management. Uses AES-256-GCM encryption with a master key derived from OS keychain (keytar), AWS KMS, or environment variables. Provides `getSecret()`/`hasSecret()` for database-backed encrypted credential access with caching. Includes `runStartupChecks()` to validate encryption and database connectivity at boot.

**`vectorstore`** — SQLite-vec backed vector database for semantic search. Exports `SqliteVecStore` with collection-based organization, multiple embedding providers (OpenAI, Gemini, Ollama, Mistral), and document splitting with configurable chunk size and overlap.

### Domain Layer

Core business logic for workflows, nodes, agents, and persistence.

**`kernel`** — The workflow orchestration engine. Key components:
- `Graph` — DAG data structure with O(1) node/edge lookup via Map-based indexing, edge type validation, cycle detection, and topological sort (Kahn's algorithm).
- `WorkflowRunner` — Coordinates execution: graph initialization, `NodeInbox` creation for message buffering, actor spawning for concurrent node execution, edge counter tracking for end-of-stream propagation, and output collection.
- `NodeActor` — Executes individual nodes by resolving a `NodeExecutor` implementation, managing output routing, and handling streaming/batched inputs.
- `NodeInbox` — Per-node message buffer that tracks upstream completion and supports different sync modes (`zip_all` waits for all inputs, `on_any` fires immediately).

**`node-sdk`** — The framework for defining custom nodes. Exports `BaseNode` (abstract class with static metadata, property/output declarations, and serialization), `NodeRegistry` (central type registry), and TypeScript decorators (`@node()`, `@output()`, `@property()`) for declarative node definition. Nodes implement `process(context, values)` returning an output record.

**`agents`** — Multi-step LLM agent system with layered execution:
- `Agent` / `SimpleAgent` — Agent abstractions with skill loading.
- `AgentExecutor` → `TaskPlanner` → `TaskExecutor` → `StepExecutor` — Decomposes goals into tasks, executes them with tool availability.
- Tool system with 100+ tools across categories: search (Google, DataForSEO), code execution, file I/O, browser automation (Playwright), email, image generation, PDF processing, vector search, workflow management, and MCP (Model Context Protocol) integration.

**`models`** — Database persistence layer using Drizzle ORM over SQLite. Defines tables for: `workflows` (DAG definitions), `jobs` (execution records), `messages` / `threads` (chat history), `assets` (file metadata), `secrets` (encrypted credentials), `workspaces`, `workflowVersions`, `oauthCredentials`, `predictions` (usage/cost tracking), `runNodeState`, `runEvents`, and `runLeases` (distributed job leasing).

### Feature Layer

Node implementations and provider integrations.

**`base-nodes`** — 100+ built-in node types organized by category: input/output, data processing (lists, dicts, transforms), text manipulation, code execution (Python/JS/TS via isolated-vm), document processing (PDF extraction, DOCX/Excel/Markdown conversion), image/audio/video processing, web scraping (Playwright), email, search, agent execution, vector store operations, and LLM model integration (Gemini, Anthropic, OpenAI).

**`dsl`** — Type-safe TypeScript DSL for programmatically defining workflows. Converts between DSL representation and kernel graph format.

**`chat`** — Chat protocol and runtime integration for conversational AI interactions.

**`replicate-nodes`**, **`fal-nodes`**, **`elevenlabs-nodes`** — Provider-specific node packs for Replicate AI, FAL AI, and ElevenLabs voice synthesis. Each extends `BaseNode` from node-sdk.

**`huggingface`** — HuggingFace model discovery, cache scanning, and artifact inspection for local model management.

### Application Layer

Entry points that wire everything together.

**`websocket`** — The main server package. Runs an HTTP + WebSocket server on port 7777 (default).

HTTP API routes (40+ endpoints):
| Route prefix | Purpose |
|---|---|
| `/api/workflows/*` | Workflow CRUD, tools, examples |
| `/api/jobs/*` | Job status, triggers, cancellation |
| `/api/messages/*`, `/api/threads/*` | Chat messages and threads |
| `/api/assets/*` | Asset storage, search, thumbnails |
| `/api/nodes/*` | Node metadata and validation |
| `/api/settings/*` | Configuration and secrets |
| `/api/collections/*` | Vector store collections |
| `/api/models/*` | LLM provider model listings |
| `/api/users/*`, `/api/workspaces/*` | User and workspace management |
| `/v1/*` | OpenAI-compatible API endpoints |
| `/api/oauth/*` | OAuth flows |

WebSocket commands handled by `UnifiedWebSocketRunner`:
| Command | Purpose |
|---|---|
| `run_job` | Execute a workflow DAG |
| `chat_message` | Chat with agent mode |
| `inference` | Direct LLM inference |
| `cancel_job` | Stop execution |
| `reconnect_job` / `resume_job` | Resume existing or suspended jobs |
| `stream_input` / `end_input_stream` | Push streaming data to input nodes |
| `get_status` | Query job status |

The server also registers all node types (base + provider nodes), initializes the Python bridge for HuggingFace/MLX node execution, and sets up tool registries.

**`cli`** — Interactive terminal UI built with React + Ink. Provides `nodetool-chat` for conversational AI and `nodetool` for workflow management, connecting to the WebSocket server.

**`deploy`** — Deployment utilities supporting Docker image build/push, SSH remote deployment, RunPod GPU cloud, and Google Cloud Run/Compute Engine. Uses YAML configuration files.

### Workflow Execution Pipeline

```
Client sends "run_job" via WebSocket
        │
        ▼
UnifiedWebSocketRunner (packages/websocket)
  ├── Creates ProcessingContext with storage, cache, secrets
  ├── Resolves node executors (TS registry → Python bridge fallback)
  │
  ▼
WorkflowRunner (packages/kernel)
  ├── Graph.fromDict() — validates and indexes the DAG
  ├── Creates NodeInbox per node (message buffers)
  ├── Dispatches input values to InputNodes
  │
  ▼
NodeActor (packages/kernel)
  ├── Pulls messages from NodeInbox
  ├── Resolves NodeExecutor for node type
  ├── Calls BaseNode.process(context, values)
  │
  ▼
BaseNode.process() (packages/node-sdk or base-nodes)
  ├── Executes node logic
  ├── Emits ProcessingMessages via context
  │
  ▼
Output Routing
  ├── Results sent along edges to downstream NodeInboxes
  ├── Edge counters track end-of-stream propagation
  ├── OutputUpdate messages streamed to client via WebSocket
  │
  ▼
Client receives streaming updates (JobUpdate, NodeUpdate, OutputUpdate)
```

### Agent System

```
User sends "chat_message" with agent mode
        │
        ▼
AgentExecutor
  ├── Loads agent skills and available tools
  │
  ▼
TaskPlanner
  ├── Uses LLM to decompose goal into ordered tasks
  │
  ▼
TaskExecutor (for each task)
  ├── Selects relevant tools
  │
  ▼
StepExecutor
  ├── Calls LLM with tool schemas
  ├── Processes tool_call responses
  ├── Executes tools (search, code, file, browser, etc.)
  ├── Returns tool results to LLM
  ├── Repeats until task is complete
  │
  ▼
Results streamed to client via WebSocket
```

### Node System

Nodes are the fundamental units of computation. Each node:
- Extends `BaseNode` from `node-sdk`
- Declares input properties with types and defaults
- Declares output slots with type information
- Implements `process(context, values)` returning output values
- Can be synchronous or streaming (via `StreamingInputs`/`StreamingOutputs`)

```typescript
@node({ namespace: "math", title: "Add" })
class AddNode extends BaseNode {
  @property({ type: "float" }) a: number = 0;
  @property({ type: "float" }) b: number = 0;
  @output({ type: "float" })  result: number = 0;

  async process(context: ProcessingContext, values: { a: number; b: number }) {
    return { result: values.a + values.b };
  }
}
```

Node types are registered in `NodeRegistry` and resolved at runtime by the kernel's executor resolution chain: TypeScript registry → Python bridge fallback.

---

## Frontend Architecture

### Technology Stack

| Layer | Technology | Version |
|---|---|---|
| UI Framework | React | 18.2 |
| Language | TypeScript | 5.7 |
| Bundler | Vite | 6.4 |
| Component Library | Material-UI (MUI) | v7 |
| State Management | Zustand | 4.5 |
| Server State | TanStack Query (React Query) | v5 |
| Graph Editor | @xyflow/react (React Flow) | v12 |
| Routing | React Router | v7 |
| Styling | Emotion (CSS-in-JS) | v11 |
| Code Editor | Monaco Editor | — |
| Rich Text | Lexical | — |
| 3D Visualization | React Three Fiber + Three.js | — |
| Panel Layout | Dockview | — |
| Testing | Jest + React Testing Library | 29.7 |
| E2E Testing | Playwright | 1.57 |

### Application Shell & Routing

The app entry point (`web/src/index.tsx`) wraps the application in a provider stack:

```
<ErrorBoundary>
  <ThemeProvider theme={ThemeNodetool}>
    <CssBaseline />
    <QueryClientProvider>
      <MobileClassProvider>
        <MenuProvider>
          <WorkflowManagerProvider>
            <KeyboardProvider>
              <RouterProvider routes={...} />
            </KeyboardProvider>
          </WorkflowManagerProvider>
        </MenuProvider>
      </MobileClassProvider>
    </QueryClientProvider>
  </ThemeProvider>
</ErrorBoundary>
```

Routes:

| Path | Component | Description |
|---|---|---|
| `/` | NavigateToStart | Redirects to editor or dashboard |
| `/dashboard` | Dashboard | Home screen |
| `/editor/:workflow` | TabsNodeEditor | Multi-tab workflow editor |
| `/chat/:thread_id?` | GlobalChat | AI chat interface |
| `/standalone-chat/:thread_id?` | StandaloneChat | Full-screen chat |
| `/apps/:workflowId?` | MiniAppPage | Mini-app runner |
| `/miniapp/:workflowId` | StandaloneMiniApp | Standalone mini-app |
| `/assets` | AssetExplorer | Asset browser |
| `/collections` | CollectionsExplorer | Vector collection browser |
| `/templates` | ExampleGrid | Template workflow gallery |
| `/models` | ModelListIndex | HuggingFace model browser |
| `/login` | Login | Authentication page |

All routes except `/login` and dev routes are wrapped in `ProtectedRoute`.

### State Management

The frontend uses a multi-layer state management approach:

**Zustand stores (55+)** manage client-side state. Major stores:

| Store | Responsibility |
|---|---|
| `NodeStore` | Per-tab graph state (nodes, edges) with @xyflow/react integration and temporal undo/redo via zundo |
| `WorkflowManagerStore` | Open workflows, create/load/copy/delete via API, localStorage persistence |
| `WorkflowRunner` | Per-workflow execution state machine (idle → connecting → running → completed/error) |
| `GlobalChatStore` | Chat threads, messages, WebSocket streaming, tool calls |
| `AgentStore` | Agent execution and workflow automation |
| `ResultsStore` | Workflow execution results and previews |
| `AssetStore` | Asset management with TanStack Query integration |
| `MetadataStore` | Node type metadata registry |
| `SettingsStore` | User settings with localStorage persistence |
| `ModelDownloadStore` | HuggingFace model downloads with progress tracking |
| `NotificationStore` / `ErrorStore` | User-facing notifications and errors |
| `LayoutStore` / `PanelStore` | UI layout and panel visibility |
| `KeyPressedStore` | Keyboard event tracking |

Store patterns:
- Selector-based subscriptions to prevent unnecessary re-renders: `useStore(state => state.value)`
- Middleware: `persist()` for localStorage, `temporal()` for undo/redo
- Per-workflow stores created and managed by `WorkflowManagerContext`

**TanStack Query** manages server state (data fetching, caching, mutations):
- `useWorkflow()`, `useAssets()`, `useWorkflowVersions()` — query hooks in `serverState/`
- Hierarchical query keys: `['workflows', workflowId]`
- Automatic cache invalidation after mutations

**React Contexts** coordinate cross-cutting concerns:
- `WorkflowManagerContext` — manages all per-workflow `NodeStore` instances for the tabbed editor, persists open workflows to localStorage, provides validation helpers
- `NodeContext` — provides node-specific data within node component trees
- `EditorInsertionContext` — manages editor insertion/creation points

### Component Architecture

```
web/src/components/
├── node_editor/       # Core graph editor (canvas, drag-drop, selection)
├── node/              # Individual node rendering and property editing
├── node_menu/         # Node search and quick-add menu
├── panels/            # App layout (Header, PanelLeft, PanelRight, PanelBottom)
├── editor/            # Multi-tab editor (TabsNodeEditor)
├── chat/              # Chat UI (GlobalChat, messages, streaming)
├── dashboard/         # Dashboard / home page
├── assets/            # Asset explorer and editor
├── workflows/         # Workflow templates and grid views
├── collections/       # Vector collection management
├── hugging_face/      # Model browser and download manager
├── miniapps/          # Mini-app page rendering
├── vibecoding/        # AI-assisted coding integration
├── terminal/          # Terminal emulator (xterm.js)
├── textEditor/        # Rich text editor (Lexical)
├── audio/             # Audio player and waveform components
├── video/             # Video player components
├── asset_viewer/      # Asset preview (PDF, images, 3D models)
├── inputs/            # Form inputs and input widgets
├── widgets/           # Node input widgets (color pickers, sliders, etc.)
├── buttons/           # Reusable button components
├── dialogs/           # Modal dialogs
├── menus/             # Context menus and dropdowns
├── themes/            # MUI theme configuration
├── ui_primitives/     # Low-level UI primitives
├── ui/                # Generic shared UI components
└── common/            # Shared components (loaders, errors)
```

### WebSocket Communication

The frontend communicates with the backend via a single WebSocket connection managed by `WebSocketManager` (in `web/src/lib/websocket/`):

- **Binary protocol** — Messages are encoded with msgpack (not JSON) for performance
- **State machine** — Connection states: `disconnected` → `connecting` → `connected` → `reconnecting` → `failed`
- **Auto-reconnect** — Exponential backoff with configurable decay (1.5×) and max attempts (10). Auth/policy errors (codes 1008–1011, 4000–4003) are not retried.
- **Message queuing** — Outbound messages are queued during connection and flushed when connected
- **Global singleton** — `GlobalWebSocketManager` provides a shared connection for all stores

Messages flow:
```
WorkflowRunner store ──┐
GlobalChatStore ───────┼──▶ GlobalWebSocketManager ──▶ WebSocket ──▶ Server
AgentStore ────────────┘              ▲
                                      │
                              message events
                                      │
                              ◀───────┘
```

### API Client

The REST API client (`web/src/stores/ApiClient.ts`) is generated from an OpenAPI schema using `openapi-fetch`:
- **Type-safe** — Request/response types generated by `openapi-typescript`
- **Auth middleware** — Automatically attaches Supabase Bearer tokens on production; skips auth on localhost
- **Environment detection** — `isLocalhost` / `isElectron` / `isProduction` flags derived from hostname, URL parameters, and localStorage preferences
- **Dev proxy** — Vite proxies `/api` → `localhost:7777`, `/ws` → WebSocket, `/storage` → asset storage during development

### Code Splitting & Performance

Vite production builds use manual chunk splitting:

| Chunk | Contents |
|---|---|
| `vendor-react` | React, ReactDOM, React Router |
| `vendor-mui` | Material-UI, Emotion |
| `vendor-plotly` | Plotly.js |
| `vendor-three` | Three.js, React Three Fiber |
| `vendor-editor` | Monaco Editor, Lexical |
| `vendor-pdf` | React PDF viewer |
| `vendor-waveform` | WaveSurfer.js |

Heavy components (PanelLeft, PanelRight, PanelBottom, Dashboard, Chat, Editor) are lazy-loaded with `React.lazy()` and `<Suspense>` boundaries.

---

## Electron Desktop App

The Electron shell (`electron/`) wraps the web UI for desktop use:

- **Electron** 35.7.5 with **Vite** for the renderer process
- Uses `contextBridge` for secure IPC — `nodeIntegration` is disabled
- `electron-builder` for packaging (Windows, macOS, Linux including Flatpak)
- `electron-updater` for auto-updates
- `electron-log` for structured logging
- Hash-based routing (`#/path`) for compatibility with file:// protocol
- Preload scripts bridge frontend tool calls to main process capabilities

---

## Mobile App

The React Native mobile app (`mobile/`) enables users to browse and run mini-apps:

- **Expo SDK 54** with React Native 0.81
- **React Navigation** (native-stack) for screen transitions
- **Zustand** for state management (WorkflowRunner, ChatStore)
- **Axios** for HTTP, custom `WebSocketManager` with msgpack for real-time chat
- **AsyncStorage** for persistent settings (server URL configuration)
- Screens: MiniAppsListScreen, MiniAppScreen, SettingsScreen, ChatScreen

See [mobile/ARCHITECTURE.md](mobile/ARCHITECTURE.md) for detailed mobile architecture documentation.

---

## Communication Protocols

### WebSocket Protocol

All WebSocket messages use **msgpack** binary encoding.

**Client → Server commands:**
```
run_job          { job_id, workflow_id, graph, params }
chat_message     { thread_id, content, model, tools }
inference        { model, messages, tools }
cancel_job       { job_id }
reconnect_job    { job_id }
resume_job       { job_id }
stream_input     { job_id, node_id, data }
end_input_stream { job_id, node_id }
get_status       { job_id }
```

**Server → Client events:**
```
job_update       { job_id, status }           # Job lifecycle (started, completed, failed, cancelled)
node_update      { job_id, node_id, status }  # Node execution state changes
output_update    { job_id, node_id, value }   # Streaming output values
node_progress    { job_id, node_id, progress } # Progress percentage
task_update      { task_id, status, result }  # Agent task progress
planning_update  { plan }                     # Agent planning status
prediction       { model, tokens, cost }      # LLM usage tracking
error            { message, details }         # Error notifications
```

### HTTP API

REST endpoints follow standard conventions:
- JSON request/response bodies
- Bearer token authentication
- OpenAPI spec for type generation
- Vite dev proxy for local development

---

## Data Flow Examples

### Workflow Execution

```
1. User clicks "Run" in the editor
2. WorkflowRunner store serializes the graph from NodeStore
3. Sends "run_job" command via GlobalWebSocketManager (msgpack)
4. Server creates ProcessingContext with storage and secrets
5. WorkflowRunner (kernel) validates and indexes the graph
6. NodeActors process nodes concurrently following the DAG topology
7. Each node's BaseNode.process() emits ProcessingMessages
8. Outputs route along edges to downstream NodeInboxes
9. Server streams job_update, node_update, output_update to client
10. WorkflowRunner store updates execution state
11. ResultsStore updates output previews
12. NodeStore reflects node status (running, completed, error)
```

### Chat / Agent Interaction

```
1. User sends a message in the chat UI
2. GlobalChatStore sends "chat_message" via WebSocket
3. Server creates or retrieves the thread
4. AgentExecutor loads skills and tools for the agent
5. TaskPlanner uses LLM to decompose the goal into tasks
6. StepExecutor iterates: LLM call → tool_call → tool execution → result
7. Tool calls that need frontend context are forwarded via UIToolProxy
8. Streaming chunks sent as they're generated
9. GlobalChatStore appends chunks to the current message
10. Final message stored in database (models package)
```

---

## Storage & Persistence

| Data | Storage | Location |
|---|---|---|
| Workflows, jobs, threads, messages | SQLite (Drizzle ORM) | `packages/models` |
| Assets (images, audio, video, files) | Pluggable: filesystem, S3, or Supabase | `packages/storage` |
| Encrypted secrets | SQLite + AES-256-GCM | `packages/security` + `packages/models` |
| Vector embeddings | SQLite-vec | `packages/vectorstore` |
| User settings (frontend) | localStorage | `web/src/stores/SettingsStore` |
| Open workflows (frontend) | localStorage | `web/src/stores/WorkflowManagerStore` |
| Server URL (mobile) | AsyncStorage | `mobile/src/services/api.ts` |

---

## Authentication

Authentication is handled by `packages/auth` with pluggable providers:

| Provider | Use Case |
|---|---|
| `LocalAuthProvider` | Single-user local development (file-based) |
| `StaticTokenProvider` | Fixed API token for headless/CI usage |
| `MultiUserAuthProvider` | Multi-user with role-based access (admin, user) |
| `SupabaseAuthProvider` | Production cloud authentication |

The frontend uses Supabase JS client for session management, token refresh, and attaches Bearer tokens via API client middleware.

---

## Deployment

Supported deployment targets (via `packages/deploy`):

| Target | Description |
|---|---|
| **Local** | Docker container on local machine |
| **Docker** | Container build and push to registry |
| **SSH** | Remote deployment to self-hosted servers |
| **RunPod** | GPU cloud platform for ML workloads |
| **GCP** | Google Cloud Run / Compute Engine |

Deployments are configured via YAML files and managed through the CLI. The same server image runs in all environments — only the storage adapter and auth provider change.

---

## Build System

### Top-Level Make Targets

```bash
make install          # Install all dependencies (web, electron, mobile)
make build            # Build all packages + web
make typecheck        # TypeScript type-check all packages
make lint             # Lint all packages
make lint-fix         # Auto-fix linting issues
make test             # Run all tests
make check            # typecheck + lint + test (quality gate)
make clean            # Remove dependencies and build artifacts
```

### Package Build Order

Packages must be built in dependency order. The root `build:packages` script handles this:

```
protocol → config → security → storage → auth → code-runners
    → runtime → vectorstore → models → kernel → node-sdk
    → agents → base-nodes → dsl → chat → huggingface
    → replicate-nodes → fal-nodes → elevenlabs-nodes
    → websocket → cli → deploy
```

### Development Mode

```bash
make dev              # Starts websocket server + web dev server (concurrent)
make electron         # Builds web, starts Electron desktop app
```

Vite dev server runs on port 3000 with hot module replacement. API calls are proxied to the backend on port 7777.

---

## Testing Strategy

| Layer | Framework | Location |
|---|---|---|
| Backend packages | Vitest | `packages/*/tests/` |
| Web unit tests | Jest + React Testing Library | `web/src/__tests__/`, `web/src/components/__tests__/` |
| Web E2E tests | Playwright | `web/tests/e2e/` |
| Electron unit tests | Jest | `electron/src/__tests__/` |
| Electron E2E tests | Playwright | `electron/tests/e2e/` |
| Mobile tests | Jest | `mobile/src/__tests__/` |

Backend packages use Vitest with per-package `vitest.config.ts` files. The web app uses Jest with jsdom environment and extensive module mocks. E2E tests use Playwright with automatic server startup.

```bash
# Run all tests
make test

# Package-specific
cd packages/kernel && npx vitest run
cd web && npm test
cd web && npm run test:e2e
```

CI/CD is managed through 19 GitHub Actions workflows covering unit tests, E2E tests, code quality, security auditing, accessibility, performance monitoring, and release automation.
