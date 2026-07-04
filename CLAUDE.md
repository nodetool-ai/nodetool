# NodeTool

Visual AI workflow platform. TypeScript monorepo with React frontend, Electron desktop app, and Node.js backend.

> _Last updated: 2026-06-19._ When the architecture, commands, or rules below drift from the codebase, update this file in the same PR.

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
# First-time setup
nvm use              # Reads .nvmrc, activates Node 22.22.1
npm install          # Install all workspace dependencies
npm run build:packages  # Build backend packages
```

**Agents / dev containers:** where Node is already installed (Claude Code on the
web, Codex, CI), run `bash scripts/agent-setup.sh` — it does the install + build
above, skips work on a warm tree, and installs the one native-build dep
(`libsecret-1-dev`). On Claude Code on the web it runs automatically via the
`.claude/hooks/session-start.sh` SessionStart hook. See
[docs/developer/agent-setup.md](docs/developer/agent-setup.md).

## Architecture

```
packages/           # 55 npm workspace packages (TypeScript backend)
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

web/                # React 19 + Vite + MUI + Zustand + ReactFlow
electron/           # Electron 39 desktop app
mobile/             # React Native / Expo
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
- **Deploy = image + web/dist bind-mount, not host packages**. The deploy unit is the GHCR image built by `.github/workflows/docker.yml` (pulled by `deploy.sh`). Backend code is baked into the image, so a backend change needs a new image. Only `web/dist` is mounted from the host (read-only), so a frontend change just needs `npm run build:web`. A host `npm run build:packages` does not affect the running container — it rebuilds local packages the image never reads.
- **Redeploy current main with one command**: `npm run redeploy` (`scripts/redeploy.sh`). It refuses on a dirty tree (uncommitted tracked changes), fetches + fast-forwards `main`, rebuilds `web/dist`, then runs `./deploy.sh` with the restored prod config (from `.deploy/ports.env`). It skips the image pull when the local `:latest` was already built from HEAD (matching `GIT_COMMIT_HASH`), otherwise waits for the CI image. It ends by printing container `/health` and a running-image-revision-vs-HEAD match (pass/fail), and is idempotent — safe to re-run. Prefer it over calling `deploy.sh` by hand.
- **WebSocket messages use MsgPack**, not JSON. Use the existing serialization helpers.
- **Don't create new WebSocket instances** — use `GlobalWebSocketManager` singleton.
- **Mobile typecheck** requires building protocol first: `cd packages/protocol && npm run build`.
- **`mobile/` is intentionally NOT a root workspace** (it has its own Expo/React Native dependency tree that must not be hoisted). Its scripts use `npm --prefix mobile …`, not `npm --workspace=mobile …` — the latter will fail. Do not "standardize" these to `--workspace`.
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
npm run dev:chat -- --agent --provider anthropic --model claude-sonnet-4-6

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
-m, --model <id>         Model ID (e.g. claude-sonnet-4-6, gpt-5.4-mini)
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

### nodetool run (DSL Workflows)

```bash
npm run dev:nodetool -- run workflow.ts            # Run a TypeScript DSL file
npm run dev:nodetool -- run workflow.ts --json     # Output results as JSON
```

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
tool (runs the workflow + returns status, outputs, errors, job logs, and the
graph overview in one call). The browser surface is exposed in `web/` as
`npm run test:debug-harness` (env: `NODETOOL_DEBUG_GRAPH`, `NODETOOL_DEBUG_OUT`,
`NODETOOL_DEBUG_PARAMS`).

### nodetool validate (Static Workflow Check)

Checks a workflow against the node registry **without running it** — unknown
node types, missing required properties, unselected models, dangling and
mis-typed edges. Returns in well under a second, so it's the cheap pre-flight
before an expensive `debug` run. Accepts a workflow id, JSON file, or DSL `.ts`
file. File/DSL targets need no database.

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
    "agent.provider": "anthropic", "agent.model": "claude-sonnet-4-6",
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
