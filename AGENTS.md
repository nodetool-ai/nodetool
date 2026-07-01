# AGENT RULES

Guidelines for working with code in this repository. These are linter-like rules and build/test instructions — not a code summary.

> _Last updated: 2026-06-19._ Keep this in sync with the codebase; update it in the same PR when rules or commands change.

> **Canonical standards live in [docs/DEVELOPMENT_STANDARDS.md](docs/DEVELOPMENT_STANDARDS.md).** That document is the single source of truth for enforceable rules and aspirational targets across TypeScript, React, Zustand, MUI, TanStack Query, ReactFlow, Fastify, Drizzle, Zod, Electron security, accessibility, performance, security, observability, error handling, git/PR hygiene, and dependency management. The rules in this file are the area-specific overlay — read both.

## Quick Navigation

- **[Development Standards](docs/DEVELOPMENT_STANDARDS.md)** — **Canonical standards for the whole repo (MUST READ).**
- **[Design System](docs/DESIGN.md)** — **Design token rules: SPACING, TYPOGRAPHY, BORDER_RADIUS, MOTION, Z_INDEX (MUST READ for any UI work).**
- **[TypeScript Backend](packages/AGENTS.md)** — TypeScript backend packages (`packages/`)
- **[Web UI](web/src/AGENTS.md)** — React web application
  - [Components](web/src/components/AGENTS.md), [Stores](web/src/stores/AGENTS.md), [Contexts](web/src/contexts/AGENTS.md), [Hooks](web/src/hooks/AGENTS.md), [Utils](web/src/utils/AGENTS.md), [ServerState](web/src/serverState/AGENTS.md), [Lib](web/src/lib/AGENTS.md), [Config](web/src/config/AGENTS.md)
- **[UI Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md)** — Primitives-first policy, decision tree, migration rules (MUST READ for frontend work)
- **[Testing](web/TESTING.md)** — Web testing guide (Jest, React Testing Library, Playwright)
- **[Electron](electron/src/AGENTS.md)** — Desktop app
- **[Mobile](mobile/README.md)** — React Native mobile app
- **[Agent System](docs/AGENTS.md)** — Agent architecture, tools, skills, workflow nodes
- **[Agent Harnesses & Tooling](#agent-harnesses--tooling)** — Validate, debug, run, single-node, browser, deploy, trace (the tools that close the build→verify loop)
- **[Scripts](scripts/AGENTS.md)** — Build and release scripts

---

## Agent Harnesses & Tooling

The repo ships harnesses built for the agent edit→verify loop: check a workflow
before running it, run it and read everything it emitted, run a single node in
isolation, drive the real browser, deploy, and trace token/cost. Reach for these
before hand-rolling a script. Every CLI command runs from source with
`npm run dev:nodetool -- <cmd>` (no build) or from `dist` with
`npm run nodetool -- <cmd>` after `npm run build:packages`. The full flag
reference lives in [CLAUDE.md](CLAUDE.md) and [docs/cli.md](docs/cli.md).

| Need | CLI harness | Agent/MCP tool | Speed |
|---|---|---|---|
| Static pre-flight (unknown nodes, missing props, bad edges) — **run this first** | `nodetool validate <id\|file.json\|file.ts>` | `validate_workflow` (inline `graph` or `workflow_id`) | < 1 s, no DB for file targets |
| Run a workflow end-to-end and read every message/log/output/error | `nodetool debug <id\|file>` (server surface, default) | `debug_workflow` (status + outputs + errors + job logs + graph in one call) | seconds |
| Real-browser surface (Playwright + Chromium canvas), trace, per-stage shots | `nodetool debug <id> --browser --trace --stages` | — | tens of seconds (opt-in) |
| Tight edit→verify loop on a file target | `nodetool debug file.ts --watch` (prints a verdict **diff** per save) | — | per-save |
| Run one node in isolation with a prop bag | `nodetool node run <type> --props '{…}' [--no-secrets]` | — | sub-second hermetic |
| Run a workflow (id, JSON, or DSL `.ts`) | `nodetool run <file>` / `nodetool workflows run <id> [--params …]` | `run_workflow`, `start_background_job` | varies |
| Map changed files → minimal workspaces to rebuild/test | `nodetool affected [--base main]` | — | instant |
| Author/inspect a graph against the live registry | — | `create_workflow`, `search_nodes`, `list_nodes`, `get_node_info`, `get_example_workflow`, `export_workflow_digraph` | — |
| Jobs & assets | `nodetool jobs …` / `nodetool assets …` | `list_jobs`, `get_job`, `get_job_logs`, `list_assets`, `get_asset` | — |
| Agent/chat REPL (loop \| plan \| graph \| multi-agent) | `nodetool-chat --agent` (`npm run dev:chat`) | — | — |
| Deploy + remote ops (Docker/SSH/RunPod/GCP/Supabase) | `nodetool deploy <init\|plan\|apply\|status\|logs\|destroy>`; `deploy workflows <sync\|run>`, `deploy database`, `deploy collections` | — | — |
| Trace tokens/cost/timing (OTel span tree) | `--trace-file <f.jsonl>` / `--trace-stdout pretty\|json` on any CLI run | — | — |

The **agent/MCP tools** above are the `@nodetool-ai/agents` MCP tools
(`packages/agents/src/tools/mcp-tools.ts`), exposed to in-product agents and over
the websocket MCP server — use them instead of shelling out when you are already
inside an agent context.

**Browser workflow harness.** The in-browser graph harness runs whole workflows
against the real backend and renders the actual ReactFlow canvas, recording IO,
traces, and screenshots — see [In-Browser Workflow Harness](#in-browser-workflow-harness)
below and [web/src/e2e_runner/README.md](web/src/e2e_runner/README.md). The same
surface backs `nodetool debug --browser` and `web`'s `npm run test:debug-harness`.

**Suggested loop:** `validate` (cheap, catches structural bugs) → `node run` to
isolate a suspect node → `debug` to run the whole graph and read messages →
`debug --browser` only when a bug is browser-specific → `--trace` when chasing
token/cost/latency.

---

## Prerequisites

- **Node.js 22.22.1** (required — see `.nvmrc`). Matches Electron 39's embedded Node (22.22.1). Native module ABI rebuild is handled by `@electron/rebuild` in `electron/`'s postinstall.
- Use `nvm use` to activate the correct version.
- If you see `NODE_MODULE_VERSION` errors, run `npm rebuild`.
- **Fresh checkout or missing `node_modules`**: if `npm run typecheck`/`lint`/`test` fail with module-resolution errors (`Cannot find module`, `Cannot find type definition file`) on files you didn't touch, run `npm install` first — don't spend a cycle proving the failure predates your change. Re-run the checks after install before investigating further.

## Build, Lint & Test Commands

### Make Targets (Recommended)

```bash
npm install          # Install all dependencies (web, electron, mobile)
npm run build            # Build all packages
npm run typecheck        # Type check all packages
npm run lint             # Lint all packages
npm run lint:fix         # Auto-fix linting issues
npm run test             # Run all tests
npm run check            # Run all checks (typecheck, lint, test)
```

### Backend Packages

```bash
npm run build:packages                          # Build all in dependency order
npm run test:packages                           # Test all packages
npm run test --workspace=packages/<name>        # Test single package
npm run test:watch --workspace=packages/<name>  # Watch mode for single package
```

### Web Package

```bash
cd web
npm install              # Install dependencies
npm start                # Start dev server
npm run build            # Production build
npm run typecheck        # TypeScript check
npm run lint             # ESLint
npm run lint:fix         # Auto-fix lint issues
npm test                 # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
npm run test:e2e         # Run e2e tests (requires backend)
```

### Electron Package

```bash
cd electron
npm install              # Install dependencies
npm start                # Start electron
npm run build            # Production build (tsc + vite + electron-builder)
npm run typecheck        # TypeScript check
npm run lint             # ESLint
npm run lint:fix         # Auto-fix lint issues
npm test                 # Run tests
```

### Development Servers

```bash
npm run dev                 # Backend (tsx --watch) + web Vite server
npm run dev:server          # Backend dev server only (tsx --watch, port 7777)
npm run electron            # Build web and start Electron app
npm run electron:dev        # Electron against Vite server (requires conda env)
```

### Mandatory Post-Change Verification

After **any** code change, run:

```bash
npm run typecheck  # Type check all packages
npm run lint       # Lint all packages
npm run test       # Run all tests
```

All three must pass before the task is complete.

### Code Review for Regressions

Before submitting a PR, review for:

1. **Existing tests still pass** and cover the changes
2. **No new TypeScript errors or lint warnings**
3. **No unintended side effects** in related code
4. **Edge cases and error handling** are covered
5. **Performance implications** considered

---

## Common Pitfalls

- **Decorator packages load from `dist/`**: `base-nodes`, `node-sdk`, `fal-nodes`, `replicate-nodes`, `elevenlabs-nodes`, `minimax-nodes` use decorators. After changing these, run `npm run build:packages` before running `npm run dev`.
- **Package build order matters**: Always use `npm run build:packages` (builds in dependency order). Don't build individual packages with unbuilt dependencies.
- **Mobile typecheck needs protocol**: Run `cd packages/protocol && npm run build` before `npm run typecheck:mobile`.
- **`mobile/` is not a root workspace**: it keeps its own Expo/React Native deps, so its scripts use `npm --prefix mobile …` (not `npm --workspace=mobile …`, which would fail).
- **WebSocket uses MsgPack, not JSON**: Use existing serialization helpers. Don't serialize WebSocket messages as JSON.
- **Don't create WebSocket instances**: Use `GlobalWebSocketManager` singleton in the frontend.
- **ES Modules everywhere**: All packages use `"type": "module"`. Compiled imports need `.js` extensions.
- **Never import from `dist/`**: Use `@nodetool-ai/<package>` workspace references in source code.

---

## TypeScript Rules

> Full standards: [DEVELOPMENT_STANDARDS §1 TypeScript](docs/DEVELOPMENT_STANDARDS.md#1-typescript).

- Use TypeScript for all new code. Never use `any` — prefer `unknown` + narrowing or proper generics.
- Use `const` by default, `let` when reassignment is needed. Never use `var`.
- Use strict equality (`===` / `!==`). Exception: `== null` for null/undefined checks.
- Always use curly braces for control statements.
- Use `Array.isArray()` to check for arrays, not `typeof`.
- Throw `Error` objects, not strings.
- Always add comments for intentionally empty catch blocks.
- No `// @ts-ignore` — use `// @ts-expect-error <reason>`.
- No `enum` in new code — use `as const` objects + `keyof typeof` unions.
- Prefer discriminated unions over optional fields with implicit invariants.
- Validate untrusted input with Zod at the boundary — see [DEVELOPMENT_STANDARDS §11](docs/DEVELOPMENT_STANDARDS.md#11-zod-validation).

## React Rules

- Use functional components only. No class components.
- Always define a TypeScript interface for component props.
- Never mutate state directly. Use immutable patterns.
- Don't use inline functions in JSX when passed to memoized child components.
- Test behavior, not implementation details.

### Hooks

| Hook | Use When | Do Not Use When |
|------|----------|-----------------|
| `useEffect` | Side effects (network, subscriptions, timers, DOM) | Deriving data from props/state |
| `useMemo` | Expensive computation, referential stability | Cheap computation |
| `useCallback` | Passing to memoized children, dependency of effect/memo | Function used only locally |
| `React.memo` | Pure component, stable props, renders often, expensive | Props change every render |

**Never** add these "just in case." If performance is fine, do nothing.

### Custom Hooks

- Always prefix with `use`.
- Use descriptive names: `useWorkflowActions` not `useActions`.
- Include all dependencies in `useEffect`, `useCallback`, `useMemo` arrays.
- Provide TypeScript types for all return values.

## Zustand Rules

- Keep stores focused on a single domain.
- Use selectors to prevent unnecessary re-renders: `useStore(state => state.value)`.
- Use shallow equality for object selections.
- Define actions within the store alongside state.
- Use `persist` middleware for settings stored in localStorage.

## MUI / Styling Rules

- **MANDATORY: Use UI primitives from `web/src/components/ui_primitives/` for all frontend UI.** Never import raw MUI components (`Typography`, `Button`, `IconButton`, `Tooltip`, `CircularProgress`, `Chip`, `Dialog`, `Alert`, `Divider`, `Paper`, `Skeleton`, `Tabs`, `Drawer`, `Breadcrumbs`, `Select`, `Switch`, `TextField`) directly in component files. These are only allowed inside `ui_primitives/` and `editor_ui/` where the primitives are defined.
- See the **[Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md)** for the full decision tree, migration rules, and 90+ available primitives.
- When touching any component file, **opportunistically migrate** raw MUI usage to primitives.
- Replace `display: "flex"` / `flexDirection` patterns with `FlexRow` / `FlexColumn` layout primitives.
- Replace `<Typography>` with `Text`, `Label`, or `Caption` primitives.
- Replace `<CircularProgress>` with `LoadingSpinner`. Replace `<Tooltip>` with `Tooltip` primitive.
- Use `sx` prop for one-off styles on primitives. Use `styled()` only inside `ui_primitives/` for defining new primitives.
- Use theme values for spacing, colors, and typography — never hardcode hex colors or pixel values.
- Prefer composition over deep prop drilling.
- If no primitive exists for your use case, **create a new primitive** in `ui_primitives/` rather than using raw MUI.

### Design Token Rules (see [docs/DESIGN.md](docs/DESIGN.md) for full reference)

Every style value that falls into one of the categories below must use the corresponding token — never hardcode.

| Category | Forbidden | Use instead |
|---|---|---|
| Spacing / gap / padding | `5px`, `10px`, `13px`, `0.25` theme units | `SPACING.*` / `GAP.*` / `PADDING.*` |
| Font size | `"14px"`, `"0.85rem"`, any raw px/rem | `var(--fontSize*)` or `<Text>`/`<Label>`/`<Caption>` |
| Font weight | `700`, `"bold"`, `300` | `400`, `500`, or `600` only |
| Border radius | `4`, `10`, `18`, `"var(--rounded-*)"` | `BORDER_RADIUS.xs/sm/md/lg/xl/xxl/pill/circle` |
| Transitions | `"all 200ms ease"`, raw timing strings | `MOTION.all/border/background/…` |
| Z-index | `9999`, `1000`, arbitrary integers | `Z_INDEX.dropdown/modal/tooltip/…` |

## TanStack Query Rules

- Use hierarchical query keys: `['workflows', workflowId]`.
- Set appropriate `staleTime` based on data volatility.
- Use `enabled` option for conditional queries.
- Use optimistic updates for mutations where appropriate.
- Always invalidate related queries after successful mutations.

## File & Naming Conventions

- **Components**: PascalCase (`MyComponent.tsx`)
- **Hooks**: camelCase with `use` prefix (`useMyHook.ts`)
- **Stores**: PascalCase file, camelCase `use` prefix for hook (`useMyStore`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_NODES`)
- **Types/Interfaces**: PascalCase (`NodeData`)
- **Tests**: Same as source + `.test.ts(x)`, placed in `__tests__/` directories

## Import Order

1. React and core libraries
2. Third-party libraries (MUI, TanStack Query, etc.)
3. Internal stores and contexts
4. Internal components
5. Internal utilities and types
6. Styles

## Testing Rules

- Use React Testing Library queries (`getByRole`, `getByLabelText`).
- Use `userEvent` for interactions, not `fireEvent`.
- Use `waitFor` for async assertions.
- Mock external dependencies and API calls.
- Test user-facing behavior, not implementation details.
- Keep tests independent and isolated.

## E2E Testing Setup

E2E tests require the TypeScript backend and Node.js frontend. For comprehensive E2E testing documentation, see **[web/TESTING.md](web/TESTING.md)**.

```bash
# Build the backend packages first (one time)
npm run build:packages

# Install and run
cd web
npm install
npx playwright install chromium
npm run test:e2e           # Automatically starts servers

# Manual setup for debugging
# Terminal 1: PORT=7777 HOST=127.0.0.1 node packages/websocket/dist/server.js
# Terminal 2: cd web && npm start
# Terminal 3: cd web && npx playwright test
```

### In-Browser Workflow Harness

A browser-based graph harness that runs whole workflows against the **real** backend and renders the actual ReactFlow canvas per workflow, recording IO, traces, and screenshots into a self-contained HTML report. Frontend lives in `web/src/e2e_runner/`, backend in `packages/websocket/src/e2e-server.ts`. See **[web/src/e2e_runner/README.md](web/src/e2e_runner/README.md)**.

```bash
cd web
npm run test:e2e-runner          # headless: boots backend + Vite, runs the suite
npm run test:e2e-runner:headed   # watch it run in a browser
```

### Electron E2E Tests

```bash
cd electron
npm install
npx playwright install chromium
npm run vite:build && npx tsc  # Build first
npm run test:e2e               # Run E2E tests
```

See **[electron/src/AGENTS.md](electron/src/AGENTS.md)** for Electron-specific testing.

## Security

> Full standards: [DEVELOPMENT_STANDARDS §16 Security](docs/DEVELOPMENT_STANDARDS.md#16-security) and [§12 Electron Security](docs/DEVELOPMENT_STANDARDS.md#12-electron-39-security).

- Use `DOMPurify.sanitize()` for user input rendered as HTML.
- Never use `dangerouslySetInnerHTML` with unsanitized input.
- Use `contextBridge` for Electron IPC — never expose `nodeIntegration`.
- Validate all IPC inputs with Zod before acting on them.
- No `eval`, `new Function`, or `setTimeout` with string arguments.
- Secrets never appear in code, logs, or error messages.
- `npm audit` must pass — high/critical advisories block merge unless waived with rationale.

## Accessibility, Performance, Observability

These three areas have full sections in the central standards doc:

- **[Accessibility (§14)](docs/DEVELOPMENT_STANDARDS.md#14-accessibility-a11y)** — WCAG 2.2 AA target, semantic HTML, keyboard parity, focus management.
- **[Performance (§15)](docs/DEVELOPMENT_STANDARDS.md#15-performance)** — Bundle and runtime budgets, lazy loading, virtualization.
- **[Observability (§17)](docs/DEVELOPMENT_STANDARDS.md#17-observability)** — OpenTelemetry spans, structured logs, semantic conventions.

## Git, Commits, Pull Requests

> Full standards: [DEVELOPMENT_STANDARDS §20](docs/DEVELOPMENT_STANDARDS.md#20-git-commits-prs).

- Conventional commits: `feat(scope):`, `fix(scope):`, etc. Subject ≤ 72 chars, imperative mood.
- One concept per commit. Body explains WHY, not WHAT.
- Never `--no-verify`. Never rewrite published history.
- PRs are small (target <400 LOC), self-reviewed, and CI-green before review.

## Writing & Docs

> Full guide: [docs/WRITING_STYLE.md](docs/WRITING_STYLE.md). Comment/README rules: [DEVELOPMENT_STANDARDS §19](docs/DEVELOPMENT_STANDARDS.md#19-documentation--comments).

- Write prose — docs, READMEs, this file, PR descriptions, comments — concise and concrete. Cut any sentence that survives deletion without losing meaning.
- **No AI slop.** Forbidden: `leverage`, `utilize`, `seamless`, `robust`, `powerful`, `comprehensive`, `cutting-edge`, `unlock`, `empower`, `streamline`, `it's worth noting`, `dive into`, rule-of-three padding, "it's not just X, it's Y", emoji decoration, and the rest of the [forbidden list](docs/WRITING_STYLE.md#forbidden-expressions).
- Bold-label bullets must add information beyond the label. Claims are concrete: numbers, names, paths — not adjectives.
- When you edit a Markdown file, fix slop you pass in the same change. For code, use the `unslop` skill.

## Technologies

### TypeScript Backend (`packages/`)
- **Node.js LTS**, **TypeScript 5.4+**, **ES Modules**
- **Vitest** for testing
- Key packages: `@nodetool-ai/websocket` (server), `@nodetool-ai/kernel` (runtime), `@nodetool-ai/cli` (CLI)
- See [packages/AGENTS.md](packages/AGENTS.md) for full package list

### Web
- **React 18.2.0**, **TypeScript 5.7.2**, **Vite 6.4.1**
- **MUI v7.2.0** + Emotion, **Zustand 4.5.7**, **ReactFlow 12.10.0**
- **TanStack Query v5.62.3**, **React Router v7.12.0**
- **Jest 29.7.0** + React Testing Library 16.1.0, **Playwright** for E2E

### Electron
- **Electron 39.8.8**, **React 19.1.0**, **TypeScript 5.3.3**
- **Zustand 5.0.3**, **Vite 6.4.1**

### Mobile
- **React Native / Expo** - See [mobile/README.md](mobile/README.md)
