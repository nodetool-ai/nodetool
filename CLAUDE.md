# NodeTool

Visual AI workflow platform. TypeScript monorepo with React frontend, Electron desktop app, and Node.js backend.

> _Last updated: 2026-07-11._ When the architecture, commands, or rules below drift from the codebase, update this file in the same PR.

## Critical Commands

```bash
# After ANY code change, run all three:
npm run typecheck   # Type check all packages (web, electron, mobile)
npm run lint        # Lint all packages
npm run test        # Run all tests (web, electron, mobile)

# Combined check (runs all three above):
npm run check
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
npm run dev          # Backend (tsx --watch) + web Vite server
npm run dev:server   # Backend only
npm run electron:dev # Electron dev (auto-rebuilds native modules)
```

### Prerequisites

- **Node.js 22.22.1** (required — see `.nvmrc`). Matches Electron 39's embedded Node so dev and the packaged app run on the same Node. Use `nvm use` to activate.
- npm (comes with Node)
- Python 3.11+ with conda (optional, for Python nodes)

```bash
# First-time setup — start.sh does all of it, then starts the server
./start.sh           # API on :7777   (full | web | check | doctor)

# Or by hand:
nvm use              # Reads .nvmrc, activates Node 22.22.1
npm install          # Install all workspace dependencies
npm run build:packages  # Build backend packages
```

In Claude Code **web** sessions, `.claude/hooks/session-start.sh` installs
dependencies before the session starts, so `npm run typecheck`/`lint`/`test`
work immediately. Slash commands: `/serve`, `/verify`, `/onboard`. See
[.claude/README.md](.claude/README.md).

## Architecture

```
packages/           # 58 npm workspace packages (TypeScript backend)
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
  websocket/        # Fastify HTTP + WebSocket server (main API, port 7777)
  cli/              # nodetool CLI
  vectorstore/      # SQLite-vec for RAG
  app-runtime/      # Mini-app document, bindings, instance state, streaming fold
                    # (shared by web, the CLI `app debug` harness, and mobile)
  model-pricing/    # Unit price for a selected FAL/kie/GenSpend model (web + runner)
  ...

web/                # React 19 + Vite + MUI + Zustand + ReactFlow
electron/           # Electron 39 desktop app
mobile/             # React Native / Expo (documents open one-per-screen, no tabs;
                    # edits come through the chat agent's ui_* tools —
                    # see mobile/ARCHITECTURE.md § Documents)
demo/               # Remotion harness for product-demo videos (replays recorded
                    # graph-UI "casts"; see demo/README.md and web/src/demo/)
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
- **Design tokens (MANDATORY)**: See **[docs/DESIGN.md](docs/DESIGN.md)** for the token systems — `SPACING` (4px grid), `TYPOGRAPHY` (4-size scale), `BORDER_RADIUS`, `MOTION`, `Z_INDEX`. **Never** hardcode border radii (`4`, `10`, `18px`), transition strings (`"all 200ms ease"`), font sizes (`"14px"`, `"0.85rem"`), or off-grid spacing (`5px`, `10px`, `13px`). Use the named constants from `ui_primitives`. When touching any UI file, fix violations in the same PR.
- **Styling**: MUI v7 + `sx` prop for one-off, `styled()` for reusable. Theme values only, no hardcoded colors/spacing. Prefer `FlexRow`/`FlexColumn` over `Box sx={{ display: "flex" }}` when the shorthand props (`gap`, `align`, `justify`) reduce verbosity; use `Box` directly when you have significant additional `sx` overrides anyway.
- **Node graph**: ReactFlow 12. Nodes extend `BaseNode` from `@nodetool-ai/node-sdk`.
- **LLM providers**: All in `packages/runtime/src/providers/` — Anthropic, OpenAI, Gemini, Ollama, Mistral, Groq, Claude Agent SDK
- **Agent system**: `packages/agents/` — full planning agent (TaskPlanner → DAG of Steps), SimpleAgent (single-step), AgentExecutor (value extraction)
- **Workflow execution**: Actor-model in `packages/kernel/` — DAG-based, message-passing between node actors
- **Python bridge**: `PythonStdioBridge` in `packages/runtime/` — spawns `python -m nodetool.worker --stdio`, communicates via length-prefixed msgpack over stdin/stdout. Lazy-connected on first workflow with Python nodes.
- **Serialization**: MsgPack for WebSocket messages, JSON for REST API
- **ES Modules**: All packages use `"type": "module"`. Imports need `.js` extension in compiled output.

## Pre-Commit

Before every commit, run lint and typecheck. Do not commit if either fails.

```bash
npm run lint        # Must pass before committing
npm run typecheck   # Must pass before committing
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
- All inter-package imports use `@nodetool-ai/<package>`. Never import from `dist/`.
- Throw `Error` objects, not strings. Comment intentionally empty catch blocks.
- Prose (docs, READMEs, AGENTS.md, comments) follows [docs/WRITING_STYLE.md](docs/WRITING_STYLE.md): concise, concrete, no AI slop (`leverage`, `seamless`, `robust`, `comprehensive`, `it's worth noting`, rule-of-three padding…). Fix slop you pass when editing Markdown.

## Common Pitfalls

- **Node.js 22.22.1 is required**. This matches Electron 39's embedded Node (`process.versions.node === "22.22.1"`). Pinning the major keeps API parity between dev and the packaged app. The backend (dev and prod) runs on vanilla Node, not Electron's embedded Node, so the one source-built native module — `better-sqlite3` — is rebuilt against **Node** headers by the root `postinstall` (`electron/scripts/rebuild-native.mjs`). N-API modules (`bufferutil`, `sharp`, `keytar`, `sqlite-vec`) are ABI-stable, ship their own prebuilds via their normal install scripts, and are not rebuilt here.
- **base-nodes, node-sdk, fal-nodes, replicate-nodes, elevenlabs-nodes** use decorators and load from `dist/`. After changing these, run `npm run build:packages` before `npm run dev`.
- **Package build order matters**. Use `npm run build:packages` which builds in dependency order, not `npm run build` on individual packages that have unbuilt dependencies.
- **Deploy = the GHCR image, self-contained**. The prod server runs on **Fly.io** (`fly.toml`, app `nodetool`, https://nodetool.fly.dev / https://api.nodetool.ai). The deploy unit is the GHCR image built by `.github/workflows/docker.yml`; `web/dist` and workflow examples are baked into it (no host bind-mount). A push to `main` builds the image (`docker.yml`) and then auto-deploys it to Fly (`fly-deploy.yml`), so both backend and frontend changes ship in a new image. Migrations run once per release via Fly's `release_command` (see `fly.toml`).
- **Self-hosting** (outside Fly) uses `docker-compose.yml` (reference compose) or the `packages/deploy` tooling. The old self-hosted `deploy.sh`/`npm run redeploy` box was decommissioned once Fly took over.
- **Packaged Electron backend flattens file paths**. esbuild bundles the backend into one `server.mjs`, so anything resolved relative to `import.meta.url` (provider `*-manifest.json`, examples, `package://` assets) lives elsewhere in the packaged app than in dev. Data files a package loads at runtime must be declared in `PACKAGE_RUNTIME_ASSETS` (`packages/config/src/package-asset-registry.ts`) and loaded via `loadPackageAssetJson` from `@nodetool-ai/config` — the registry drives staging (`scripts/bundle-backend.mjs`) and artifact verification (`scripts/verify-backend-bundle.mjs`), and unregistered loads throw in dev. See [electron/src/AGENTS.md § Packaged file layout](electron/src/AGENTS.md).
- **The packaged backend only resolves what `bundle-backend.mjs` stages, in a flat `_modules/`**. One version per package name wins, so a dependency npm hoisted for an older major can take the slot a newer one needs — invisible in dev, fatal in the artifact. `npm run backend:smoke` stages the bundle and boots `server.mjs` against `/health`; run it after touching `scripts/bundle-backend.mjs`, a native dependency, or anything the backend loads lazily. CI runs it as the Quality Gate `bundle` leg and again per-OS in `release.yaml`.
- **Price catalogs are generated — never hand-edit them.** FAL/kie come from `packages/fal-codegen`; `packages/model-pricing/src/generated/genspend-pricing.json` covers every other provider and comes from the GenSpend catalog, refreshed by the nightly `GenSpend Pricing Sync` workflow (`npm run sync:genspend` locally after `build:packages`, `npm run sync:genspend:check` to see whether it is stale). The sync matches GenSpend models against the models each provider enumerates in NodeTool, so it never emits an id NodeTool doesn't ship; unmatched models are reported, and `scripts/genspend/aliases.json` is where a maintainer pins or blocks one. The job opens a PR when a price moved — a number that gates a run's budget gets reviewed, not auto-merged. See [packages/model-pricing/README.md](packages/model-pricing/README.md).
- **WebSocket messages use MsgPack**, not JSON. Use the existing serialization helpers.
- **Don't create new WebSocket instances** — use `GlobalWebSocketManager` singleton.
- **Mobile typecheck** requires building protocol first: `cd packages/protocol && npm run build`. The one shared package mobile compiles from **source** (no build) is `@nodetool-ai/app-runtime`, wired in `mobile/metro.config.js`, `tsconfig.json` and `jest.config.js` — all three must agree.
- **`mobile/` is intentionally NOT a root workspace** (it has its own Expo/React Native dependency tree that must not be hoisted). Its scripts use `npm --prefix mobile …`, not `npm --workspace=mobile …` — the latter will fail. Do not "standardize" these to `--workspace`.
- **`npm install` fails in sandboxed/proxied environments** (CI sandboxes, Claude Code on the web): `keytar` needs `apt-get install -y libsecret-1-dev` first; `electron` and `onnxruntime-node` download binaries in postinstall, which proxies can 403 (`ELECTRON_SKIP_BINARY_DOWNLOAD=1` covers Electron; onnxruntime has no skip var). Any postinstall failure rolls back the whole `node_modules` tree. For lint/typecheck-only work, `npm install --ignore-scripts` sidesteps all of it. Details: [AGENTS.md § Install in sandboxed / proxied environments](AGENTS.md#install-in-sandboxed--proxied-environments).
- **Native module install is a single command**: a clean checkout builds with `npm ci` (or `npm install`) alone — no manual follow-up. The native `better-sqlite3` rebuild runs from the **root** `postinstall` (`electron/scripts/rebuild-native.mjs`), which fires *after* npm has fully reified the tree. It deliberately does **not** run from the electron workspace's own postinstall: that fired mid-reify and raced npm's atomic renames of node-gyp's deps (`tinyglobby`), giving intermittent `Cannot find module 'tinyglobby'` failures. If you ever hit a `NODE_MODULE_VERSION` mismatch, force a rebuild with `npm run rebuild:native` (root) or `npm --prefix electron run rebuild:native`.
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
npm run dev:chat -- --agent --provider anthropic --model claude-sonnet-5

# Piped input (non-interactive)
echo "research 5 AI topics" | npm run dev:chat -- --agent --provider openai --model gpt-5.4-mini

# Connect to running WebSocket server
npm run dev:chat -- --agent --url ws://localhost:7777/ws
```

Chat flags:
```
-a, --agent [mode]       Agent mode: off | loop | plan | graph | multi-agent
                         (default: plan when --agent is given without a value)
--no-agent               Force agent mode off
-p, --provider <name>    anthropic, openai, gemini, xai, groq, mistral, deepseek,
                         moonshot, minimax, cerebras, together, openrouter,
                         huggingface, replicate, kie, aki, ollama, lmstudio
                         (any registry provider id also works, e.g. vllm, llama_cpp)
-m, --model <id>         Model ID (e.g. claude-sonnet-5, gpt-5.4-mini)
-w, --workspace <path>   Workspace directory for file tools
--tools <list>           Comma-separated tool names
-u, --url <ws-url>       Connect to WebSocket server instead of local provider
```

Interactive commands: `/agent <off|loop|plan|graph|multi-agent>`, `/model <id>`, `/provider <name>`, `/tools`, `/clear`, `/exit`

### nodetool serve

```bash
npm run dev:nodetool -- serve                     # Start on localhost:7777
npm run dev:nodetool -- serve --host 0.0.0.0      # Bind all interfaces
npm run dev:nodetool -- serve --port 8080          # Custom port
```

### MCP bundle (.mcpb) for Claude Desktop

```bash
npm run build:mcpb        # → dist/nodetool.mcpb (runs an end-to-end smoke test)
```

Builds a one-file MCP bundle that Claude Desktop (and other MCPB-aware
agents) installs by drag-and-drop. The bundle is a stdio↔streamable-HTTP
bridge (`scripts/mcpb/bridge.mjs`, packed by `scripts/build-mcpb.mjs`) that
talks to a running NodeTool server's `/mcp` endpoint — no native modules, so
one artifact covers macOS/Windows/Linux. When the server isn't running the
bridge starts anyway in offline mode: it serves a `nodetool_status` tool with
startup instructions, retries in the background, and hot-attaches (with
`list_changed` notifications) when the server appears — including after a
mid-session app restart. User config in the bundle: server URL (default
`http://127.0.0.1:7777/mcp`) and an optional bearer token. For CLI agents
(Claude Code, Codex) use `nodetool mcp install` instead.

Every release builds and attaches `nodetool-<version>.mcpb` to the GitHub
Release (`release.yaml`, built once on Linux since the bundle is
cross-platform).

The desktop app ships the same bundle: the electron build runs `prepare-mcpb`
and bundles `nodetool.mcpb` as an extra resource (`electron-builder.json`).
**Settings → MCP → Claude Desktop → Install Extension** hands it to the OS
(`window.api.mcp.installBundle` → `MCP_INSTALL_BUNDLE` IPC →
`electron/src/mcpBundle.ts`), which opens Claude Desktop's install dialog
(falling back to reveal-in-folder when no handler is registered). The button is
desktop-only — it's hidden in the browser/remote UI.

### nodetool run (DSL Workflows)

```bash
npm run dev:nodetool -- run workflow.ts            # Run a TypeScript DSL file
npm run dev:nodetool -- run workflow.ts --json     # Output results as JSON
```

### Supervised runs (`--supervise`)

`--supervise` puts an agent on the failure path: a node invocation that throws
after its own error handling raises an escalation, and the agent answers with
one verdict — retry, repair the output, skip the item, or fail. Without the
flag no escalation is ever constructed and the run is unchanged.

Available on `nodetool run`, `nodetool workflows run`, and `nodetool debug`
(server surface). The flags configure `ExecutionSessionOptions.supervisor` —
the one integration point every surface shares; no CLI code touches
`WorkflowRunner`.

```bash
npm run dev:nodetool -- workflows run <id> --supervise
npm run dev:nodetool -- run workflow.ts --supervise --max-decisions 5
npm run dev:nodetool -- debug <id> --supervise --supervisor-cost-cap 0.25
npm run dev:nodetool -- workflows run <id> --supervise \
  --supervisor-model openrouter/openai/gpt-5.4-mini --max-retries 1
```

```
--supervise                       Supervise this run (off unless passed)
--max-decisions <n>               Decisions allowed in the run (default 10)
--max-retries <n>                 Retries per node invocation (default 2)
--supervisor-cost-cap <usd>       Ceiling on supervisor spend (default 0.50)
--supervisor-model <provider/model>  Default anthropic/claude-sonnet-4-6,
                                  or NODETOOL_SUPERVISOR_MODEL
```

Each decision prints a `⛨` line as it happens and the run ends with a
supervised summary (`⛨ supervised: 2 skipped, 1 retried, 3 decisions,
+$0.0200`). With `--json` the decisions appear as `interventions` (run
commands; `nodetool run` wraps them as `{results, interventions}`) or
`server.summary.interventions` plus a `server.supervised` rollup (`debug`).
It is the `Intervention` record from `@nodetool-ai/protocol`, which the editor
surface consumes unchanged. Supervisor spend goes into the prediction
ledger `nodetool costs` reads, one row per billable decision, attributed to the
run and tagged `supervisor` in `node_type`.

Every supervisor failure (timeout, unparseable verdict, exhausted budget,
cancelled run) resolves as `fail`. Details:
[docs/workflow-supervisor-design.md](docs/workflow-supervisor-design.md).

### nodetool debug (Workflow Debug Harness)

Runs a workflow end-to-end on the **server** (headless kernel `WorkflowRunner`)
and optionally in a **real browser** (Playwright driving the `e2e_runner`
harness), then writes a self-contained debug bundle and prints an agent-friendly
verdict. Built for iterative troubleshooting: run → read the report → edit → re-run.

The cheap server run (workflow JSON + all messages/logs/outputs/errors) is on by
default. The **expensive** parts are opt-in flags: `--browser` (Playwright +
Chromium), `--trace` (OpenTelemetry SDK + span overhead), `--stages` (a
screenshot per run stage).

```bash
# Server surface only (default) — accepts a workflow id, JSON file, or DSL .ts file
npm run dev:nodetool -- debug <workflow_id>
npm run dev:nodetool -- debug workflow.json --params '{"prompt":"hi"}'

# Opt into the expensive parts:
npm run dev:nodetool -- debug <id> --trace                 # OTel trace (timing/tokens/cost)
npm run dev:nodetool -- debug <id> --browser               # real-browser surface (Playwright)
npm run dev:nodetool -- debug <id> --stages                # per-stage screenshots (implies --browser)

# Print the full machine-readable report to stdout for an agent to parse
npm run dev:nodetool -- debug <workflow_id> --json

npm run dev:nodetool -- debug <id> --no-server --browser   # browser only
npm run dev:nodetool -- debug <id> --out ./mydebug         # custom bundle dir
npm run dev:nodetool -- debug <id> --timeout 60000         # per-surface timeout (ms)
npm run dev:nodetool -- debug workflow.json --watch        # re-run on file change, print a verdict diff
npm run dev:nodetool -- debug <id> --supervise             # supervise the server surface (see above)
```

The `--watch` flag (file targets only) re-runs after every save and prints just
what changed since the last run — verdict ok/fail transitions, newly-appeared
and resolved issues, and token/cost movement — so the edit→verify loop is a live
diff instead of a fresh full report each time.

The bundle (`nodetool-debug/<id>-<ts>/` by default) contains:

```
report.json        # the full DebugReport (workflow JSON, both surfaces, verdict)
report.md          # human-readable summary
workflow.json      # the resolved graph (runner shape)
server/messages.jsonl   # every processing message (logs, node IO, outputs, errors)
server/trace.jsonl      # OpenTelemetry spans (timing, tokens, cost) — only with --trace
browser/record.json     # the browser RunRecord (events, logs, node IO, artifacts) — only with --browser
browser/screenshot.png  # canvas screenshot of the finished graph
browser/stages/         # canvas screenshots at each stage — only with --stages
browser/console-errors.log
```

Agents can also debug a workflow on a running server via the **`debug_workflow`**
tool. It posts to `POST /api/workflows/:id/debug`, which runs the workflow and
returns the same execution summary and verdict the CLI harness computes —
per-node status and errors, logs, LLM calls, outputs — plus the job record and
the graph overview. The summary reducer and triage live in
`@nodetool-ai/execution/debug`, so CLI and agent surfaces cannot drift.

With `interactive: true`, `run_workflow` and `debug_workflow` put the calling
agent on the failure path the way `--supervise` puts an LLM supervisor there:
a failing node invocation parks the run and the tool returns the escalation
(`status: "escalated"` with the supervisor's `Escalation` record — redacted
inputs, error detail, `allowedActions`). The agent answers via
**`resolve_workflow_escalation`** — retry, substitute, skip, end_stream, or
fail, kernel-enforced against the allowed set — and gets back either the next
escalation or the run's final report. HTTP surface:
`POST /api/workflows/:id/run|debug {interactive: true}` plus
`GET/POST /api/debug/sessions/:id[/verdict|/cancel]`
(`packages/websocket/src/debug-sessions.ts`). Escalations the agent leaves
unanswered fail closed on the decision timeout (default 10 min). The browser surface is exposed in `web/` as
`npm run test:debug-harness` (env: `NODETOOL_DEBUG_GRAPH`, `NODETOOL_DEBUG_OUT`,
`NODETOOL_DEBUG_PARAMS`).

### nodetool app debug (App-Builder Debug Harness)

Runs a mini app **headlessly** for agent debugging: validates every widget
binding against the workflow's inputs/outputs/variables, simulates the app the
way the web runtime does (seed input defaults, apply params, click the Run
button or a scripted interaction sequence), executes the workflow on the kernel
runner, folds the streamed messages into the app's reactive values, and reports
each widget's final state plus a verdict.

Three target kinds, all producing the same report: an **application id** (read
straight from the applications table, no server), an **ApplicationBundle JSON
file** (the app plus the full graphs of the workflows it binds — operations
reference bundle keys, so it runs without touching the database), and — legacy
— a **workflow id or workflow JSON file** carrying `graph` + `app_doc`, whose
document is lifted onto the host workflow.

```bash
npm run dev:nodetool -- app debug <application_id>
npm run dev:nodetool -- app debug my.app.json          # ApplicationBundle file
npm run dev:nodetool -- app debug workflow.json --params '{"prompt":"hi"}'
npm run dev:nodetool -- app debug <id> --no-run       # static wiring check only
npm run dev:nodetool -- app debug <id> --json         # full AppDebugReport for agents

# Scripted interactions: set values, change inputs, click widgets (by
# component id, unique type, or unique label), and run or cancel an
# operation by id
npm run dev:nodetool -- app debug <id> --interact \
  '[{"set":{"key":"prompt","value":"hi"}},{"click":"Button-1"}]'
npm run dev:nodetool -- app debug <id> --interact \
  '[{"set":{"key":"tone","value":"terse","operationId":"draft"}},{"run":"draft"},{"cancel":"draft"}]'
```

The harness runs **every** declared operation, not just the first: each resolves
its own graph, and state is keyed per operation.

The verdict catches app-level failures a workflow-only run can't: bindings that
reference missing inputs/outputs/variables, apps with no run trigger, and
display widgets that never receive a value from a completed run. It also catches
what the operation/variable layer makes mis-configurable — an output mapped to
an undeclared variable, a mapping keyed on a node the workflow lacks, an event
naming an operation the document never declares, a widget showing execution
state of an operation nothing can run, and an elapsed `timeoutMs`. A
`persist: true` variable that is `instance`-scoped warns rather than being
silently downgraded.

The bundle (`nodetool-debug/app-<id>-<ts>/`) contains `report.json`/`report.md`,
`app.json` (the app document), `workflow.json`, and
`server/run-N.messages.jsonl` per triggered run. The report carries final
variable values, the activity label stream, and each invocation's policy
decision, so an agent can see why a run was replaced, queued, or timed out.
Simulator code: `packages/execution/src/app-debug/`
(`@nodetool-ai/execution/app-debug`), so every host — the CLI, the agent build
loop, the server — simulates an app the same way. The CLI keeps target
resolution and bundle writing in `packages/cli/src/app-debug/`.

Conditions and formatting are simulated: after every fold the harness evaluates
each widget's `visibleWhen`/`disabledWhen`, a click or change on a widget that
is hidden or disabled fails the step and names the condition, a run trigger
whose condition never held is an error, and a widget with a `format` template
reports what the template renders. Resource collections come from an in-memory
provider the script seeds — `{"seedResource":{"id":"<binding>","items":[…]}}`
as an interaction step, or a `resource:<binding>` key in `--params`. A
`from: "resource"` input then resolves through it, resource widgets report their
collection in the report, and a `resourceCommand` mutates it; running an
operation whose input reads an unseeded binding fails and says how to seed it.
Not simulated headlessly (the report lists this too, under `notSimulated`):
layout, styling, focus, and scroll; and the stored collections themselves — a
run never reads the database, and `openResource` has no editor to open.

The shipped example apps are curated `ApplicationBundle` files in
`packages/base-nodes/nodetool/examples/apps/`, built from the spec in
`scripts/example-apps/apps.mjs` by `node scripts/build-example-apps.mjs`. The
build resolves every workflow, input, and output by name against the shipped
template graphs, validates each bundle with `nodetool app debug --no-run`, and
writes the preview bundles in `web/public/app-preview/`. Example workflows
carry no `app_doc`. `--regen -p <provider> -m <model>` answers a different
question — would `nodetool app build` produce these apps today? It derives a
`BuildSpec` from each shipped bundle, builds it, and prints the drift
(operations, variables, and widgets compared by what they show, not by their
ids, so two builds of one app differ only where they really differ). It writes
nothing: the curated bundles stay hand-approved, and drift between two model
runs is a signal to read, not a patch to apply. Add `--app <slug>` for one app.
The server lists them at `GET /api/applications/examples`
and installs one with `POST /api/applications/examples/:slug/install`, which
goes through the normal bundle import. Marketing
screenshots come from `web/scripts/screenshot-app-previews.mjs` (renders
`web/app-preview.html` headlessly → `marketing/public/apps/<slug>.png`), and
the `/apps/*` landing pages are generated by
`marketing/scripts/generate-miniapp-entries.mjs` (`npm run gen:apps`).

### nodetool app build (Mini-App Build Harness)

Turns a prompt — or a hand-written `spec.json` — into a verified
`ApplicationBundle`, without touching the database. Six stages run in order:
**spec** pins what the app must do, **plan** builds one workflow per operation
with `GraphPlanner` (or binds one you pin), **author** drives the real `ui_app_*`
tool contract to place and wire the widgets, **check** validates the app's
wiring against those graphs, **run** replays every interaction on the kernel and
asserts what each widget ends up showing, and **judge** asks a model whether
each interaction achieved what was asked — the one question a structural check
cannot answer.

The judge sees only a Check+Run-green app, one call per interaction, given the
spec's intent, the steps, and the widget states they left behind. A verdict of
not-achieved becomes the round's complaint and routes to the Author with the
judge's reasons. It fails closed: a judge that times out, errors, or answers
with something unparseable scores that interaction as not achieved. Its model is
configured apart from the builder's (`--judge-model`,
`NODETOOL_APP_JUDGE_MODEL`), defaulting to a configured model the builder did
not use, because a model grading its own work is the weakest reviewer
available; `report.judge.model` records which one ran. `--no-judge` skips the
stage, and the verdict's `notSimulated` then says nothing scored the app.

Everything wrong at the end of a pass becomes one complaint, and the next round
*edits* the document rather than rebuilding it. The loop fails closed: a budget
that runs out, an issue that reappears after being fixed, or a cancelled signal
ends the build as failed with the reason named — there is no bundle behind a
failed verdict.

```bash
npm run dev:nodetool -- app build "an app that drafts a note from a prompt" -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- app build spec.json -p openai -m gpt-5.4-mini --json
npm run dev:nodetool -- app build "..." -p anthropic -m claude-sonnet-5 --workflow <id>   # bind, never plan
npm run dev:nodetool -- app build "..." -p anthropic -m claude-sonnet-5 --max-repairs 1 --cost-cap 1.00
npm run dev:nodetool -- app build "..." -p anthropic -m claude-sonnet-5 --judge-model openai/gpt-5.4-mini
npm run dev:nodetool -- app build spec.json -p anthropic -m claude-sonnet-5 --no-judge   # structural only
npm run dev:nodetool -- app build "..." -p anthropic -m claude-sonnet-5 --supervise
npm run dev:nodetool -- app build spec.json -p anthropic -m claude-sonnet-5 --watch
```

```
-p, --provider <name>  -m, --model <id>   builder provider/model (required)
--judge-model <provider/model>            judge model (env NODETOOL_APP_JUDGE_MODEL;
                                          default: a configured model ≠ the builder's)
--workflow <id>                           pin an existing workflow (repeatable, operation order)
--max-repairs <n>   --cost-cap <usd>   --timeout <ms>
--out <dir>   --json   --no-judge   --watch
--supervise   --max-decisions <n>   --max-retries <n>
--supervisor-cost-cap <usd>   --supervisor-model <provider/model>
```

`--supervise` and its four bounds are the same flags `nodetool run`, `workflows
run`, and `debug` carry, with the same defaults (env:
`NODETOOL_SUPERVISOR_MODEL`); see [Supervised runs](#supervised-runs---supervise)
above. They apply to the **Run** stage, whose interactions execute on the kernel
— `buildApp` itself is never supervised. Each decision lands in that
interaction's run report and rolls up into `report.supervision` (the
`Intervention` records plus the run summary), and the CLI prints the usual `⛨`
lines. A supervised run's shape is a decision rather than a defect: once the
supervisor has skipped or repaired something, what the run produced less of is
recorded as a warning instead of an issue the Author is asked to repair. The
interaction's expectations stay errors — supervision does not excuse the
contract the spec pinned.

`--watch` (spec-file targets only) re-builds after every save and prints just
what changed since the last build — verdict ok/fail transitions, the stage it
ended on, issues that appeared and resolved, and cost movement. It reuses
`debug --watch`'s differ, so both harnesses read the same. The bundle directory
stays at `nodetool-debug/app-build-<slug>-watch` so each re-build overwrites the
last. A build is a model run: every save spends money.

The bundle (`nodetool-debug/app-build-<slug>-<ts>/`) holds `report.json` (the
`BuildReport`), `report.md`, `spec.json`, `app.bundle.json` (the deliverable,
written only for a green build), and `interactions/<name>/run-N.messages.jsonl`
per replayed run. Exit code 0 only when `verdict.ok`. Build spend lands in the
prediction ledger `nodetool costs` reads, one row per stage, tagged `app-build`.

Harness code: `packages/agents/src/app-build/` (`buildApp`, the spec/author/judge
stages, the `ui_app_*` bridge the `app-tools` eval also scores); the CLI keeps
the flags and the bundle. Design:
[docs/mini-app-build-harness-design.md](docs/mini-app-build-harness-design.md).

#### On the server: `POST /api/applications/build` and `build_app`

The same `buildApp` runs on the server:
`POST /api/applications/build {prompt | spec, provider, model, workflow_ids,
max_repairs, cost_cap_usd, timeout_ms}` returns the `BuildReport`, and an agent
reaches it through the **`build_app`** tool. Provider and model come from the
body, or from `NODETOOL_APP_BUILD_PROVIDER` / `NODETOOL_APP_BUILD_MODEL`; the
cost cap defaults to the harness's own $2.

A build runs for minutes, so `poll: true` returns a session id immediately and
the caller reads `GET /api/debug/sessions/:id` until it settles, or cancels with
`POST /api/debug/sessions/:id/cancel` — the same session machinery an
interactive `debug_workflow` run uses (`packages/websocket/src/debug-sessions.ts`).
A cancelled build settles as `failed` with `reason: "cancelled"`.

The bundle behind a green verdict is offered, never installed: it becomes an
application through the normal `POST /api/applications/import-bundle`. Server
code: `packages/websocket/src/lib/app-build-service.ts`.

### nodetool validate (Static Workflow Check)

Checks a workflow against the node registry **without running it** — unknown
node types, missing required properties, unselected models, dangling and
mis-typed edges, dynamic slots typed with a JSON-Schema/TypeScript name instead
of NodeTool's (`integer` → `int`), and Code node bodies. Returns in well under a
second, so it's the cheap pre-flight before an expensive `debug` run. Accepts a
workflow id, JSON file, or DSL `.ts` file. File/DSL targets need no database.

A `nodetool.code.Code` node's `code` is parsed, not just stored: a body that is
not valid JavaScript, uses `import`/`export` (the sandbox has no module loader),
reads a name that is neither a sandbox API nor one of the node's inputs
(a ReferenceError at run time), never returns, or leaves a declared output
unset on some return path is reported against the node. The analysis lives in
`@nodetool-ai/node-sdk` (`code-analysis.ts`, `code-node-validation.ts`), so the
graph validator, the `submit_code` planner and the editor read one AST.

```bash
npm run dev:nodetool -- validate <workflow_id>
npm run dev:nodetool -- validate workflow.json
npm run dev:nodetool -- validate workflow.json --json            # machine-readable report
npm run dev:nodetool -- validate <id> --warnings-as-errors        # exit non-zero on warnings too
```

The same check is exposed to agents through the **`validate_workflow`** tool:
pass an inline `graph` ({nodes, edges}) to check a graph being built, or a
`workflow_id` to fetch and validate a saved one. The validator core is
`validateGraph` in `@nodetool-ai/node-sdk`.

### nodetool timeline validate / debug (Timeline Harness)

Checks a timeline sequence without rendering it, and replays a scripted edit
session against it. The target is a timeline JSON file — a bare
`TimelineDocument` or anything carrying one under `document`, so a
`GET /api/timeline/:id` response works as-is — or a `timeline_sequences` row
id. A path that exists on disk wins over an id.

```bash
npm run dev:nodetool -- timeline validate <timeline_id>
npm run dev:nodetool -- timeline validate sequence.json --json
npm run dev:nodetool -- timeline validate <id> --warnings-as-errors

npm run dev:nodetool -- timeline debug sequence.json \
  --interact '[{"tool":"add_track","input":{"type":"audio","name":"Music"}},
               {"tool":"animate_clip","input":{"target":"shot","animations":[{"role":"in","preset":"fade"}]}}]'
npm run dev:nodetool -- timeline debug <id> --out ./mydebug --json
```

`validate` reads what a headless check can decide: a clip on a track the
document does not have, a field the schema round trip would strip, an animation
preset that does not exist, timings that cannot render. `debug` runs the same
check, then executes each `--interact` step against the headless
`ui_timeline_*` bridge — the one the `timeline-tools` eval drives — and
validates the document the session left behind. A step names a tool with or
without the `ui_timeline_` prefix; a failing step is recorded and the script
continues, so one bad target does not hide everything after it. Rendering,
playback, decode, and generation are not simulated; the report lists that under
`notSimulated`.

The bundle (`nodetool-debug/timeline-<id>-<ts>/`) holds `report.json`,
`report.md`, and `timeline.json` (the input document). Exit code 0 only when
the verdict is ok. Validation and report rules live in
`@nodetool-ai/execution/timeline-debug`; the CLI keeps target resolution, the
interaction script, and the bundle.

### nodetool node run (Single-Node Harness)

Runs one node in isolation — instantiate it, feed it a property bag, print what
it emits — without authoring a whole workflow. `--no-secrets` skips the DB for a
hermetic run.

```bash
npm run dev:nodetool -- node run nodetool.text.Concat --props '{"a":"hi ","b":"there"}'
npm run dev:nodetool -- node run <type> --props '{...}' --no-secrets   # hermetic, no DB
npm run dev:nodetool -- node run <type> --props '{...}' --json
```

### nodetool generate (Media Generation)

Generate an image from any registered provider straight to a file — no workflow.
Positional `<provider> <model> <prompt>`, with lenient name matching (`fal-ai` →
`fal_ai`, `flux-schnell` → `fal-ai/flux/schnell` via the provider's model
manifest). Currently covers text-to-image (and image-to-image with `--image`).
Resolves the provider key from the secret store or env (e.g. `FAL_API_KEY`).

```bash
npm run dev:nodetool -- generate fal-ai flux-schnell "a red fox in snow" -o fox.png
npm run dev:nodetool -- generate fal-ai flux-schnell "a logo" --aspect-ratio 1:1 -n 4
npm run dev:nodetool -- generate fal-ai flux-dev "restyle this" --image in.png --strength 0.6
npm run dev:nodetool -- generate fal-ai --list-models              # discover model ids
npm run dev:nodetool -- generate fal-ai flux-schnell "..." --json  # machine-readable
```

### nodetool eval (Agent Evaluation Suites)

Runs the GraphPlanner evaluation suite against any registered provider and
reports metrics: success rate, expectation score, one-shot rate (graphs
accepted on the first `submit_graph`), submit rounds, tool calls, duration,
and cost. Cases and expectations live in
`packages/agents/src/evals/`.

```bash
npm run dev:nodetool -- eval graph-planner --list                     # show cases
npm run dev:nodetool -- eval graph-planner -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval graph-planner -p ollama -m qwen-3.5:4b --cases summarize,branch-both-paths
npm run dev:nodetool -- eval graph-planner -p openai -m gpt-5.4-mini --json --out report.json
npm run dev:nodetool -- eval graph-planner -p anthropic -m ... --min-success 0.8   # non-zero exit below threshold
```

A **`graph-e2e`** suite takes the same planner all the way through: it plans a
workflow, executes it on the kernel with the case's inputs, and has an LLM judge
decide whether the outputs achieve the case's goal. A case succeeds only if all
three hold, and that end-to-end rate is what `--min-success` gates on. Two cases
are deterministic (exact string and arithmetic results, judge skipped) and run
without model providers; the rest need one, and cost inference twice — once for
the run, once for the judge.

```bash
npm run dev:nodetool -- eval graph-e2e --list
npm run dev:nodetool -- eval graph-e2e -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval graph-e2e -p openai -m gpt-5.4-mini --timeout 600000
```

A **`code-gen`** suite drives `CodePlanner` over the Code-node authoring shapes
(reshape, merge, compute, parse, split, format, validate, seed) and reports
first-pass and post-repair acceptance separately; `--min-success` gates on
post-repair.

```bash
npm run dev:nodetool -- eval code-gen -p anthropic -m claude-sonnet-5
```

The other two planning modes have a suite each, scoring the plan without
running it: **`task-planner`** (multi-task DAG quality — parallel width,
decomposition size, tool routing, no synthesis task) and **`script-planner`**
(orchestration-script authoring — concurrency primitives, real loops, budget
guards, no prelude shadowing).

```bash
npm run dev:nodetool -- eval task-planner -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval script-planner -p openai -m gpt-5.4-mini
```

Alongside `graph-planner` (one-shot DSL) there are eight **tool-loop** suites
that drive a real provider through the frontend `ui_*` tool contract against a
headless bridge — no browser — and score the multi-turn tool-calling flow
structurally: `tool-loop` (graph editor), `workflow-escalation`, `script-tools`,
`sketch-tools`, `timeline-tools`, `storyboard-tools`, `model3d-tools`,
`app-tools`. Same flags, metrics, and `--min-success` CI gate as
`graph-planner`. Details:
[packages/agents/CLAUDE.md](packages/agents/CLAUDE.md).

`workflow-escalation` runs the graph tools over objectives that are missing
something only the user can decide — a name, permission to delete, a choice
between two node types — plus an `ask_user` tool wired to a scripted user. Each
case scores both the question the model asked and whether the graph it went on
to build matches the answer, and one case pins every value so that asking at all
is the failure.

```bash
npm run dev:nodetool -- eval timeline-tools --list
npm run dev:nodetool -- eval script-tools -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval sketch-tools -p ollama -m qwen-3.5:4b --min-success 0.8
npm run dev:nodetool -- eval workflow-escalation -p anthropic -m claude-sonnet-5
```

An **`app-build`** suite scores `nodetool app build` end to end: eight
medium-complexity prompts (two operations, a persisted setting, a streaming
output, a gated second step, a condition that hides something) go through
spec → plan → author → check → run → judge, and a case counts as green only
when the build's verdict is ok *and* the delivered bundle has the shape asked
for. It reports the one-shot rate (green with zero repair rounds — the PRD's
north star), the green-within-budget rate that `--min-success` gates on, repair
rounds, cost, and wall clock. Two deterministic cases author from a script over
template graphs, call no provider, and run on every PR in the Quality Gate; the
full suite runs nightly (`.github/workflows/app-build-eval.yml`).

```bash
npm run dev:nodetool -- eval app-build --list
npm run dev:nodetool -- eval app-build -p anthropic -m claude-sonnet-5
# The deterministic cases — no API key needed; the provider is never called.
npm run dev:nodetool -- eval app-build --cases greeting-card,draft-then-publish \
  -p ollama -m none --no-find-model --min-success 1
```

### nodetool affected (Changed-File → Workspace Mapping)

Maps changed files (or the git working tree) to the minimal set of workspaces to
rebuild/test: the owning package plus its downstream dependents, and a
`build:packages` only when a decorator package (loads from `dist/`) is affected.
Avoids reflexively running the full 1–2 min build.

```bash
npm run dev:nodetool -- affected                       # uses git working-tree changes
npm run dev:nodetool -- affected --base main           # diff against a ref
npm run dev:nodetool -- affected packages/cli/src/x.ts # explicit files
npm run dev:nodetool -- affected --json
```

### nodetool workflows

Reads and writes the local database directly — no running server needed. Pass
`--api-url <url>` (or set `NODETOOL_API_URL`) to target a remote server instead.
The same applies to `jobs`, `assets`, and `models list/ollama/huggingface`.

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

# Export workflow as a shipped template: materialize its referenced assets into
# the package's constant asset dir (rewriting refs to package://<pkg>/<file>)
# and write the example JSON. The assets ship with the build and resolve on any
# install via /api/assets/packages/<pkg>/<file>.
npm run dev:nodetool -- workflows export-example <workflow_id>
npm run dev:nodetool -- workflows export-example <id> --package nodetool-base
npm run dev:nodetool -- workflows export-example workflow.json -o example.json

# Export/import a portable .nodetool bundle (zip): one or more workflow graphs
# plus the bytes of every asset they reference, sharable as a single file (refs
# become bundle://<file> inside, rewritten back to asset:// on import). Also
# exposed over the API (GET /api/workflows/:id/export-bundle, POST
# /api/workflows/export-bundle {workflow_ids}, POST /api/workflows/import-bundle)
# and in the editor command menu (Export/Import Workflow as Bundle).
npm run dev:nodetool -- workflows export-bundle <id> [<id2> ...] -o my-pack.nodetool
npm run dev:nodetool -- workflows import-bundle my-pack.nodetool   # → local library
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

### nodetool collections (RAG Vector Store)

Manages the vector-store collections that back RAG: CRUD, document indexing,
and semantic search. Runs in-process against the default vector provider
(sqlite-vec unless `NODETOOL_VECTOR_PROVIDER` points elsewhere) — no server
needed.

```bash
npm run dev:nodetool -- collections list                        # List collections + counts
npm run dev:nodetool -- collections create my_docs --embedding-model <id>
npm run dev:nodetool -- collections index my_docs notes.md report.txt   # Chunk + index files
npm run dev:nodetool -- collections query my_docs "how does X work" -n 5 # Semantic search
npm run dev:nodetool -- collections get my_docs                 # Metadata + document count
npm run dev:nodetool -- collections delete my_docs --yes        # Delete (skip confirm)
```

### nodetool costs

Aggregates the per-call cost/token records NodeTool tracks for every LLM call,
read straight from the local DB — no server needed.

```bash
npm run dev:nodetool -- costs summary                           # Overall + per-provider/model
npm run dev:nodetool -- costs list --limit 20                   # Recent calls
npm run dev:nodetool -- costs list --provider anthropic         # Filter by provider/model
npm run dev:nodetool -- costs by-provider                       # Grouped by provider
npm run dev:nodetool -- costs by-model --provider openai        # Grouped by model
```

### nodetool storage

Asset objects live at `<userId>/<assetId>.<ext>` so the owner is the leading
path segment — the boundary a Supabase RLS policy or S3 bucket policy can
enforce on the object itself. `migrate-keys` moves objects written under the
older flat layout. Required on Supabase/S3 when upgrading; the local file
backend falls back to the flat key on a miss.

```bash
npm run dev:nodetool -- storage migrate-keys --dry-run     # Report, write nothing
npm run dev:nodetool -- storage migrate-keys               # Move them
npm run dev:nodetool -- storage migrate-keys --user-id <id> --json
```

### nodetool auth

Signs in to providers that use an account instead of an API key. `auth claude`
runs the same OAuth flow the `claude` CLI does and writes the tokens to the
Claude Agent SDK's credential file (`$CLAUDE_CONFIG_DIR/.credentials.json`,
default `~/.claude/.credentials.json`), so a NodeTool login and a `claude login`
are interchangeable — the Claude Agent provider picks it up with no extra
configuration.

```bash
npm run dev:nodetool -- auth claude login          # browser + loopback callback
npm run dev:nodetool -- auth claude login --manual # paste the code (headless/remote)
npm run dev:nodetool -- auth claude login --console # Console (API-billed) account
npm run dev:nodetool -- auth claude status
npm run dev:nodetool -- auth claude refresh --force
npm run dev:nodetool -- auth claude logout
```

The same flow is exposed over HTTP at
`/api/oauth/claude/{start,complete,tokens,disconnect}` and as a sign-in card on
the **Models & Providers** settings page. Details:
[packages/runtime/src/providers/oauth/README.md](packages/runtime/src/providers/oauth/README.md).

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

The read commands (`workflows`, `jobs`, `assets`, `models`) hit the local
database, providers, and caches by default — no server required. Pass
`--api-url <url>` (env: `NODETOOL_API_URL`) to route through a remote server
instead.

### Observing Agent Execution

NodeTool emits a hierarchy of OpenTelemetry spans that an analyzer agent can
ingest to study and optimize prompts/agents/workflows:

```
workflow.run                       (kernel WorkflowRunner)
  node.process                     (kernel NodeActor — one per node)
    agent.execute                  (Agent.execute)
      agent.plan                   (TaskPlanner / GraphPlanner)
        llm.chat / llm.stream      (BaseProvider)
      agent.step                   (StepExecutor)
        llm.chat / llm.stream
```

Every `llm.chat` / `llm.stream` span carries `gen_ai.usage.input_tokens`,
`gen_ai.usage.output_tokens`, `gen_ai.usage.total_tokens`, and
`gen_ai.usage.cost_usd`. Token counts also appear in the `llm_call`
message events emitted by `BaseProvider`.

#### Sinks

Multiple sinks can run simultaneously (each gets its own span processor):

```bash
# JSONL log file (analyzer-friendly — one span per line)
NODETOOL_TRACE_FILE=/tmp/nodetool-trace.jsonl npm run dev:chat -- --agent
npm run dev:chat -- --agent --trace-file /tmp/nodetool-trace.jsonl

# Stdout — pretty (human) or json (JSONL)
NODETOOL_TRACE_STDOUT=pretty npm run dev:chat -- --agent
npm run dev:chat -- --agent --trace-stdout pretty
npm run dev:chat -- --agent --trace-stdout json

# OpenTelemetry — Traceloop cloud
TRACELOOP_API_KEY=your-key npm run dev:chat -- --agent

# OpenTelemetry — custom OTLP backend (Jaeger, Grafana, etc.)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 npm run dev:chat -- --agent

# Debug logging (all LLM calls, planning details)
NODETOOL_LOG_LEVEL=debug npm run dev:chat -- --agent
```

The `--trace-file` and `--trace-stdout` flags also work on the `nodetool` CLI:

```bash
npm run dev:nodetool -- --trace-file trace.jsonl run workflow.ts
npm run dev:nodetool -- --trace-stdout pretty workflows run <id>
```

#### JSONL trace schema

Each line in the file is one span:

```json
{
  "trace_id": "...", "span_id": "...", "parent_span_id": "...",
  "name": "agent.plan", "kind": "INTERNAL",
  "start_time_ms": 1700000000000, "end_time_ms": 1700000001234,
  "duration_ms": 1234,
  "status": { "code": "OK" },
  "attributes": {
    "agent.objective": "...", "agent.kind": "plan",
    "agent.provider": "anthropic", "agent.model": "claude-sonnet-5",
    "gen_ai.usage.input_tokens": 150, "gen_ai.usage.output_tokens": 80
  },
  "events": [],
  "resource": { "service.name": "nodetool" }
}
```

See [packages/agents/CLAUDE.md](packages/agents/CLAUDE.md) for agent architecture, parallel execution, skills, and tuning.

## Detailed Guidelines

**Canonical standards**: [docs/DEVELOPMENT_STANDARDS.md](docs/DEVELOPMENT_STANDARDS.md) — TypeScript, React, Zustand, MUI/primitives, TanStack Query, ReactFlow, Vitest/Jest/Playwright, Fastify, Drizzle, Zod, Electron security, WebSocket protocol, accessibility (WCAG 2.2 AA), performance budgets, security (OWASP), observability (OpenTelemetry), error handling, git/PRs, dependencies. Read this first.

Area-specific overlays:
- [Root rules](AGENTS.md) — Quick commands and base reminders
- [Backend packages](packages/AGENTS.md) — Package architecture, dependency order
- [Web UI](web/src/AGENTS.md) — Components, stores, hooks, contexts, server state
- [Electron](electron/src/AGENTS.md) — Security, IPC, platform code
- [Agent system](docs/AGENTS.md) — Planning, execution, tools, skills, workflow nodes
- [UI Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md) — Primitives-first policy, decision tree, migration rules
- [Design System](docs/DESIGN.md) — Token reference: SPACING, TYPOGRAPHY, BORDER_RADIUS, MOTION, Z_INDEX; migration checklist
- [Writing Style](docs/WRITING_STYLE.md) — Anti-slop prose rules and the forbidden-expressions list for all docs and Markdown
