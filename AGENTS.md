# NodeTool — Agent Rules

Visual AI workflow platform. TypeScript monorepo with a React frontend,
Electron desktop app, and Node.js backend.

Read [Development Standards](docs/DEVELOPMENT_STANDARDS.md) for canonical
engineering rules and targets, then the linked `AGENTS.md` files for the areas
you touch. This file adds repository-wide operating instructions. Keep detailed
architecture and command references in their linked docs. When condensing a
rule, retain a relative Markdown link to its canonical page or section. Verify
file targets and heading anchors when changing links.

Every `AGENTS.md` must have a sibling `CLAUDE.md` containing only `@AGENTS.md`
and be reachable by Markdown links from this file, directly or through another
`AGENTS.md`. Put instructions in `AGENTS.md`, never `CLAUDE.md`. Run
`npm run check:agents-docs` after changing these files.

Update guidance in the same PR when code changes invalidate it. Do not record
package/node/tool counts, lint totals, dates, eval scores, or temporary status.
Link to the command that measures them. Read exact versions from `.nvmrc` and
package manifests.

## Communication & Scope

- Use plain, specific language and unambiguous domain terms. State each fact
  once, match detail to the task, and challenge incorrect assumptions with reasons.
- Put the essential result in the final response, which the user sees first.
  Report completed work briefly, with evidence.
- Avoid analogies, filler, unearned praise, decorative headings, emoji,
  motivational language, semicolons, fragments, and excessive em dashes.
  Do not use “load-bearing”, “worth stating plainly”, “here's the honest truth”,
  “the real tension”, or “carry the argument”.
- Use headings and numbered lists when they improve navigation. For three or
  more findings, decisions, options, risks, questions, or actions, label each
  with `F1`, `D1`, `O1`, `R1`, `Q1`, or `A1` respectively. Preserve codes across
  the conversation. Omit codes for short answers.
- Deliver the requested scope. Do not add unrelated cleanup, refactoring,
  documentation, features, or abstractions for hypothetical requirements.
  Required migrations in touched files still apply.
- Never claim completion without evidence or add a co-author to a commit.

Expand these aliases only when given as a standalone instruction:

| Alias | Instruction |
|---|---|
| `scr` | Simplify, compress, and repeat your response. |
| `eli` | Explain this like I'm 18. Simplify your language. Shorten your response. |
| `foc` | Boil the response down to the most important thing to focus on. |
| `ref` | Rewrite your response with reference points. |

All prose follows [Writing Style](docs/WRITING_STYLE.md). Fix violations you
pass when editing Markdown. User-facing copy also follows [Brand & Verbal
Guidelines](docs/BRAND.md).

## Quick Navigation

- **[Development Standards](docs/DEVELOPMENT_STANDARDS.md)** — Required for all work.
- **[Repository Skills](#repository-skills)** — Task-specific engineering and NodeTool authoring workflows.
- **[Design System](docs/DESIGN.md)** — Required for UI work.
- **[UI Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md)** — Required for frontend work.
- **[Harness-First Engineering](docs/HARNESS_FIRST.md)** — The doctrine: every surface headlessly drivable, the registry, `nodetool harness audit`
- **[Agent Harnesses & Tooling](#agent-harnesses--tooling)** — Validate, debug, run, single-node, browser, deploy, trace (the tools that close the build→verify loop)
- **[Harness Reference](docs/harnesses.md)** — Every harness and agent tool surface in full: flags, what it simulates, the design behind it. CLI flags: [docs/cli.md](docs/cli.md)
- **[Production Deploy (Fly)](docs/fly-production-deploy.md)** — How `main` reaches api.nodetool.ai: the trigger chain, the rolling drain, and how to read a failed rollout
- **[Dev Environment](docs/dev-environment.md)** — Sandboxed/proxied `npm install`, WebGPU without a Vulkan driver
- **[TypeScript Backend](packages/AGENTS.md)** — TypeScript backend packages (`packages/`), and the index of the per-package overlays
- **[Agent System](packages/agents/AGENTS.md)** — Planning, execution, parallelism, skills, tuning
- **[Agent Architecture & Tools](docs/AGENTS.md)** — Agent architecture, tools, skills, workflow nodes
- **[JavaScript Sandbox](docs/javascript-sandbox.md)** — The QuickJS guest: capabilities, limits, imports, security model, and how the Code node and CodeAct use it
- **[Web UI](web/src/AGENTS.md)** — React web application
  - [Components](web/src/components/AGENTS.md), [Stores](web/src/stores/AGENTS.md), [Contexts](web/src/contexts/AGENTS.md), [Hooks](web/src/hooks/AGENTS.md), [Utils](web/src/utils/AGENTS.md), [ServerState](web/src/serverState/AGENTS.md), [Lib](web/src/lib/AGENTS.md), [Config](web/src/config/AGENTS.md)
- **[Testing](web/TESTING.md)** — Web testing guide (Jest, React Testing Library, Playwright)
- **[Electron](electron/src/AGENTS.md)** — Desktop app
- **[Mobile](mobile/AGENTS.md)** — React Native / Expo app
- **[Scripts](scripts/AGENTS.md)** — Build and release scripts
- **[Workflow Runner Example](examples/workflow_runner/AGENTS.md)** — Embeddable workflow-runner example app
- **[URL Egress Inventory](docs/url-egress-inventory.md)** — Every surface that fetches a caller-provided URL, the one address table, and the SSRF policy each surface applies
- **[Writing Style](docs/WRITING_STYLE.md)** — Anti-slop prose rules and the forbidden-expressions list for all docs and Markdown
- **[Brand & Verbal Guidelines](docs/BRAND.md)** — Positioning, voice, messaging pillars, and product lexicon for anything user-facing


### Standards by Task

Use these sections for the detailed rules summarized below.

| Task | Canonical sections |
|---|---|
| Language and runtime | [TypeScript](docs/DEVELOPMENT_STANDARDS.md#1-typescript), [ES modules](docs/DEVELOPMENT_STANDARDS.md#2-es-modules--node-runtime), [error handling](docs/DEVELOPMENT_STANDARDS.md#18-error-handling) |
| Components and state | [React](docs/DEVELOPMENT_STANDARDS.md#3-react), [Zustand](docs/DEVELOPMENT_STANDARDS.md#4-zustand), [TanStack Query](docs/DEVELOPMENT_STANDARDS.md#6-tanstack-query-v5), [ReactFlow](docs/DEVELOPMENT_STANDARDS.md#7-reactflow-12) |
| UI quality | [MUI and primitives](docs/DEVELOPMENT_STANDARDS.md#5-mui-v7--emotion--ui-primitives), [accessibility](docs/DEVELOPMENT_STANDARDS.md#14-accessibility-a11y), [performance](docs/DEVELOPMENT_STANDARDS.md#15-performance) |
| API and persistence | [Fastify](docs/DEVELOPMENT_STANDARDS.md#9-fastify-http--websocket-server), [Drizzle](docs/DEVELOPMENT_STANDARDS.md#10-drizzle-orm), [Zod](docs/DEVELOPMENT_STANDARDS.md#11-zod-validation), [WebSocket protocol](docs/DEVELOPMENT_STANDARDS.md#13-websocket-protocol) |
| Verification and diagnostics | [testing](docs/DEVELOPMENT_STANDARDS.md#8-testing), [observability](docs/DEVELOPMENT_STANDARDS.md#17-observability), [enforcement](docs/DEVELOPMENT_STANDARDS.md#22-enforcement) |
| Security boundaries | [application security](docs/DEVELOPMENT_STANDARDS.md#16-security), [Electron security](docs/DEVELOPMENT_STANDARDS.md#12-electron-39-security) |
| Delivering changes | [documentation and comments](docs/DEVELOPMENT_STANDARDS.md#19-documentation--comments), [commits and PRs](docs/DEVELOPMENT_STANDARDS.md#20-git-commits-prs), [dependencies](docs/DEVELOPMENT_STANDARDS.md#21-dependencies--versions) |

## Repository Skills

Skills live in `.claude/skills/`. The `.agents` symlink exposes the same files
through `.agents/skills/`. Use a skill when requested or when its description
and invocation policy match the task. Read the selected `SKILL.md`, then only
the supporting references needed for the current operation. User instructions
take precedence over skill guidelines.

| Task | Skill |
|---|---|
| Implement an existing spec or tickets | [implement](.claude/skills/implement/SKILL.md) |
| Diagnose code failures or performance regressions | [diagnosing-bugs](.claude/skills/diagnosing-bugs/SKILL.md) |
| Review a diff, branch, or PR | [code-review](.claude/skills/code-review/SKILL.md) |
| Remove unnecessary code or prose from a requested change | [unslop](.claude/skills/unslop/SKILL.md) |
| Develop behavior test-first | [tdd](.claude/skills/tdd/SKILL.md) |
| Write or repair web and workflow Playwright tests | [e2e-testing](.claude/skills/yts806379-everything-claude-code-e2e-testing/SKILL.md) |
| Map source structure before reading selected code | [ast-grep-outline](.claude/skills/ast-grep-outline/SKILL.md) |
| Design module interfaces and test boundaries | [codebase-design](.claude/skills/codebase-design/SKILL.md) |
| Turn an agreed discussion into a spec or dependent tickets | [to-spec](.claude/skills/to-spec/SKILL.md), [to-tickets](.claude/skills/to-tickets/SKILL.md) |
| Create or edit a NodeTool workflow graph | [nodetool-workflow-builder](.claude/skills/nodetool-workflow-builder/SKILL.md) |
| Create or update a NodeTool node implementation | [nodetool-custom-node-developer](.claude/skills/nodetool-custom-node-developer/SKILL.md) |
| Diagnose a failed or stuck workflow run | [nodetool-troubleshooter](.claude/skills/nodetool-troubleshooter/SKILL.md) |
| Direct storyboards, render shots, and assemble timelines | [storyboard-core](.claude/skills/storyboard-core/SKILL.md) |

Use [ask-matt](.claude/skills/ask-matt/SKILL.md) when the user asks which
engineering workflow fits. See [skill maintenance guidance](.claude/README.md#maintaining-skills)
when updating skills.

## Architecture

Use this map to select an area overlay. Package dependencies are declared in
workspace manifests. Build in dependency order with `npm run build:packages`.

| Area | Location |
|---|---|
| Shared messages and schemas | `packages/protocol/` |
| Configuration, secrets, auth, storage, persistence | `packages/{config,security,auth,storage,models}/` |
| Node definitions and registry | `packages/node-sdk/`, domain node packages, `packages/base-nodes/` re-exports |
| Providers, processing context, workspace | `packages/runtime/` |
| Workflow graph and actor execution | `packages/kernel/` |
| Planning and execution agents, chat | `packages/agents/`, `packages/chat/` |
| HTTP/WebSocket API, CLI, browser automation | `packages/{websocket,cli,browser}/` |
| Shared app state, pricing, 3D documents, RAG | `packages/{app-runtime,model-pricing,model3d,vectorstore}/` |
| QuickJS dependency compiler and guest-only packs | `packages/sandbox-compiler/`, `packages/sandbox-packs/` (packs are not workspaces) |
| Web, desktop, mobile | `web/`, `electron/`, `mobile/` |
| Product-demo recordings | `demo/`, `web/src/demo/` ([guide](demo/README.md)) |

### Cross-Package Rules

- Use ESM and `@nodetool-ai/<package>` imports across packages. Never import
  from `dist/` in source. Relative imports need `.js` in compiled output.
- Access run files through `context.workspace`: `read`, `write`, `list`, `stat`,
  `copy`, `move`, `delete` with workspace-relative paths. Do not branch on local
  versus cloud storage. `workspace.localDir` is null for virtual workspaces.
  Host binaries stage files through `materialize`/`absorb` and `scratchDir`.
  Nodes holding live files must require a local workspace. `context.workspaceDir`
  is deprecated.
- Workflow WebSocket messages use MsgPack and existing serialization helpers.
  REST uses JSON. Frontend connections use `GlobalWebSocketManager`, never new
  `WebSocket` instances. Frontend tools use the `ui_` prefix.
- LLM providers live in `packages/runtime/src/providers/`. Python nodes connect
  lazily through `PythonStdioBridge` using length-prefixed MsgPack over stdio.

### Frontend Rules

Read [Design System](docs/DESIGN.md) and [Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md)
before UI work. Use [Standards by Task](#standards-by-task) for React, state,
accessibility, and performance rules.

- Use `web/src/components/ui_primitives/`. Raw MUI components are allowed only
  in `ui_primitives/` and `editor_ui/`. Create a primitive if none fits.
  Migrate raw MUI usage and fix design-token violations in every UI file touched.
- Use `sx` for one-off styles. Define reusable `styled()` primitives only inside
  `ui_primitives/`. Prefer `FlexRow`/`FlexColumn` for flex layout. Use `Box` when
  significant additional `sx` overrides are needed.
- Use theme colors and named `SPACING`/`GAP`/`PADDING`, typography,
  `BORDER_RADIUS`, `MOTION`, and `Z_INDEX` tokens. No raw size, color, radius,
  transition, or z-index values. Font weights are `400`, `500`, or `600`.
- Render stored media through `ResponsiveImage`, `VideoPlayer`, or
  `AudioPlayback` with a `locator` prop. `asset://<id>` and media refs are
  identifiers, never `src`/`poster` URLs. The `src` prop accepts a
  `ResolvedMediaUrl` from `utils/resolveMediaUri.ts` or
  `hooks/useResolvedMediaUri.ts`. The boundary is checked by
  `design-tokens/no-unresolved-media-src` and
  `web/src/__tests__/mediaResolutionBoundary.test.ts`. See the
  [media resolution boundary](web/src/components/ui_primitives/STRATEGY.md#media-resolution-is-the-rendering-boundary).
- Zustand holds client state, delivered through typed context hooks and read
  with selectors. TanStack Query holds server state. Follow the central
  standards for effects, memoization, and mutation invalidation.

### File & Naming Conventions

Components, store files, types, and interfaces use PascalCase. Hooks use
camelCase with a `use` prefix and descriptive names. Utilities use camelCase.
Constants use UPPER_SNAKE_CASE. Tests use the source name plus `.test.ts(x)`
in the area's existing test directory (`__tests__/` or package `tests/`).
Give custom hooks explicit return types. Use braces for control statements
and `Array.isArray()` to identify arrays.

Import order: React/core libraries, third-party libraries, stores/contexts,
components, utilities/types, then styles.

## Prerequisites

```bash
nvm use                 # Required Node version from .nvmrc
npm install             # Install workspace dependencies
npm run build:packages  # Build backend packages in dependency order
```

`./start.sh` performs setup and starts the API on port 7777 (`full`, `web`,
`check`, `doctor` modes). Python 3.11+ with conda is optional for Python nodes.
Claude Code web setup and slash commands are in [.claude/README.md](.claude/README.md).

- On missing-module/type-definition failures in untouched files, install
  dependencies first, then rerun checks before investigating further.
- The root `postinstall` rebuilds `better-sqlite3` after npm finishes reifying
  dependencies. Keep the rebuild there, not in the Electron workspace hook.
  For `NODE_MODULE_VERSION` failures, run `npm run rebuild:native`.
- For sandbox/proxy download failures, use `npm install --ignore-scripts` only
  for lint/typecheck work. See [Dev Environment](docs/dev-environment.md).
- “No WebGPU adapter available (Node/Dawn)” requires a Vulkan ICD such as
  lavapipe. Do not skip the test. Follow the
  [headless WebGPU setup](docs/dev-environment.md#webgpu-on-a-headless-machine).
- `mobile/` has a separate dependency tree and is not a root workspace. Use
  `npm --prefix mobile …`, never `--workspace=mobile`. Build protocol before
  mobile typecheck. Its `@nodetool-ai/app-runtime` source mapping must agree
  across `mobile/metro.config.js`, `tsconfig.json`, and `jest.config.js`.
- Node packages using decorators and loading from `dist/` (`base-nodes`,
  `node-sdk`, `fal-nodes`, `replicate-nodes`, `elevenlabs-nodes`) need
  `npm run build:packages` after edits and before `npm run dev`.

## Build, Lint & Test Commands

Run from the repository root unless noted. Use [package.json](package.json) for
the full script list and [testing standards](docs/DEVELOPMENT_STANDARDS.md#8-testing)
for test design.

| Task | Command |
|---|---|
| Backend and Vite development servers | `npm run dev` |
| Backend only, port 7777 | `npm run dev:server` |
| Electron against Vite, with conda environment | `npm run electron:dev` |
| Build all / backend packages | `npm run build` / `npm run build:packages` |
| Test one backend package | `npm run test --workspace=packages/<name>` |
| Watch one backend package | `npm run test:watch --workspace=packages/<name>` |
| Inspect affected test selection | `npm run test:affected -- --dry-run` |
| Full aggregate check, when explicitly needed | `npm run check` |

### Mandatory Post-Change Verification

After any code change, run these four checks. All must pass before declaring
completion:

```bash
npm run test:affected
npm run typecheck
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

Use these for routine verification. Do not substitute the full `npm run test`
and `npm run test:packages` suites. Run additional checks only when a documented
trigger below applies or the diff crosses a dependency the selection misses.
For documentation-only changes, check affected links and run
`npm run check:agents-docs` when agent instructions change.

`test:affected` selects from commits since the merge-base with `origin/main`
plus working-tree changes. Backend tests run through Turbo with dependency
builds. App-only changes select related Jest tests. Changes to app dependencies
select the app's whole suite. Unmapped non-documentation changes select all
suites. Use `-- --base <ref>` to change the base or pass file paths to inspect
selection. If you change `buildPlan` in `scripts/test-affected.mjs`, update
`scripts/__tests__/test-affected.test.mjs`.

`harness gate` selects selfchecks through
`packages/cli/src/harness/registry.ts`. Add `--dry-run` to inspect its plan.
See [gate selection](docs/HARNESS_FIRST.md#the-gate) and
[CLI flags](docs/cli.md#nodetool-harness-gate-files). Run known affected
suites directly when a shared fixture or generated file creates an undeclared
dependency. Passing lint does not prove tests pass.

### Claims, Checks, and Measurements

See [Harness-First rules](docs/HARNESS_FIRST.md#the-rules) for reproduction and
verification requirements.

- Prove a new check fails on deliberately invalid input, then restore it.
  File audits must also assert that they inspected something.
- Reproduce bugs before fixing them and ship the reproduction. Reproduce a
  proposed rule's failure before enforcing it. Until then, report the concern.
- Claims about “all” call sites or files require enumeration. Scope conclusions
  to what you inspected. Comments are hypotheses, not evidence of behavior.
- Capture the exit status of the command being measured. A successful pipe to
  `head` does not prove its producer succeeded. `pgrep -f` can match its own
  calling shell. Recheck surprising results with an independent measurement.
- After programmatic edits, check bytes for stray control characters. Exercise
  graph/list algorithms on large inputs to catch accidental quadratic work.

## Common Pitfalls

### Deployment & Packaging

- Production ships a self-contained GHCR image to Fly.io. Backend, `web/dist`,
  and workflow examples deploy together through `.github/workflows/docker.yml`,
  `fly-deploy.yml`, and `scripts/fly-rolling-deploy.sh`. Follow the
  [production deploy guide](docs/fly-production-deploy.md). Self-hosting uses
  `docker-compose.yml` or `packages/deploy`, not the retired `deploy.sh`. See
  [deployment commands](docs/cli.md#nodetool-deploy).
- `node scripts/docker-smoke.mjs http://localhost:7777` checks a running image's
  app. Local auth trusts loopback inside the container, so this smoke setup
  needs `--network host`.
- The packaged Electron backend flattens paths into `server.mjs`. Register
  runtime data in `PACKAGE_RUNTIME_ASSETS`
  (`packages/config/src/package-asset-registry.ts`) and load JSON via
  `loadPackageAssetJson` from `@nodetool-ai/config`, not paths relative to
  `import.meta.url`. See [packaged file layout](electron/src/AGENTS.md#packaged-file-layout).
- Bundling stages one version per package name in flat `_modules/`, so hoisted
  version conflicts can appear only in the artifact. Run `npm run backend:smoke`
  after changing `scripts/bundle-backend.mjs`, native dependencies, or lazy
  backend loads.

### Generated Files

- Never hand-edit price catalogs. Use `npm run generate:fal`,
  `npm run generate:kie`, or `npm run sync:genspend` (after `build:packages`).
  Check GenSpend drift with `npm run sync:genspend:check`. Pin or block matches
  in `scripts/genspend/aliases.json`. Price changes require review, not
  auto-merge. See [model-pricing](packages/model-pricing/README.md).
- Provider codegen drift checks use checked-in fixtures without live schema,
  pricing, or timestamp inputs: `npm run generate:fal:check` and
  `npm run generate:kie:check`. Refresh intended fixture output with
  `node scripts/provider-codegen-check.mjs --provider <fal|kie> --write`.
  The gate must compare output and fail on differences or an empty comparison.
  See [FAL codegen](packages/fal-codegen/README.md) and
  [KIE codegen](packages/kie-codegen/README.md).
- Anti-slop override blocks are generated. Do not hand-edit them. The backlog
  config is report-only (`npm run lint:anti-slop`), while enforced rules run
  inside `npm run lint`. Use `lint:anti-slop:count`, `:targets`, `:write`, and
  `:check`. See [Working the backlog](tools/oxlint/anti-slop/README.md#working-the-backlog).

### Nested Claude Agent Sessions

The Claude Agent SDK spawns a native `claude` subprocess. In nested sessions,
strip `CLAUDECODE` and `CLAUDE_CODE_*`, `CLAUDE_SESSION_*`, `CLAUDE_ENABLE_*`,
`CLAUDE_AFTER_*`, `CLAUDE_AUTO_*` variables. Run as a non-root user because the
SDK refuses `--dangerously-skip-permissions` at uid 0. Preserve
`ANTHROPIC_BASE_URL`, `HTTP_PROXY`, and `HTTPS_PROXY` for routing. See
[Claude Agent SDK](docs/AGENTS.md#claude-agent-sdk).

## Agent Harnesses & Tooling

Prefer existing harnesses to custom scripts. Read the relevant entry in
[Harness Reference](docs/harnesses.md) before first use in a session. Full flags
are in [CLI Reference](docs/cli.md).

Run CLI commands from source with `npm run dev:nodetool -- <command>`, or from
built output with `npm run nodetool -- <command>` after `build:packages`.
When inside an in-product agent context, prefer the available agent/MCP tools
from `packages/agents/src/tools/mcp-tools.ts` over shell commands.

| Need | Command or tool |
|---|---|
| [Validate a graph before running it](docs/harnesses.md#nodetool-validate-static-workflow-check) | `nodetool validate <id\|file.json\|file.ts>` / `validate_workflow` |
| [Isolate a node](docs/harnesses.md#nodetool-node-run-single-node-harness) | `nodetool node run <type> --props '{…}' [--no-secrets]` |
| [Run and inspect a workflow](docs/harnesses.md#nodetool-debug-workflow-debug-harness) | `nodetool debug <id\|file>` / `debug_workflow` |
| [Recheck a file on save](docs/harnesses.md#nodetool-debug-workflow-debug-harness) | `nodetool debug file.ts --watch` |
| [Inspect a browser-specific failure](docs/harnesses.md#nodetool-debug-workflow-debug-harness) | `nodetool debug <id> --browser --trace --stages` |
| [Build and verify a mini app](docs/harnesses.md#nodetool-app-build-mini-app-build-harness) | `nodetool app build "<prompt>" -p <provider> -m <model>` / `debug_app` |
| [Execute a workflow](docs/harnesses.md#nodetool-run-dsl-workflows) | `nodetool run <file>` / `run_workflow` / `start_background_job` |
| [Inspect changed workspaces](docs/harnesses.md#nodetool-affected-changed-file--workspace-mapping) | `nodetool affected` |
| [Check capability coverage](docs/harnesses.md#nodetool-harness-registry-coverage-audit-and-the-gate) | `nodetool harness capabilities` / `npm run capabilities:check` |
| [Probe provider contracts](docs/harnesses.md#npm-run-probeproviders-provider-contract-probes) | `npm run probe:providers` |
| [Measure agent task completion](docs/harnesses.md#nodetool-jtbd-jobs-to-be-done--the-optimization-loop) | `nodetool jtbd run` / `jtbd optimize` |
| [Run shipped resource fixtures](docs/harnesses.md#graph-resource-fixtures) | `npm run fixtures:graph-resources` |
| [Inspect generation status, cost, and assets](docs/harnesses.md#nodetool-generations) | `nodetool generations list\|get\|await\|cancel\|reconcile\|sweep` |

Other task references:

| Task | Documentation |
|---|---|
| Graph authoring, jobs, assets | [Workflows](docs/harnesses.md#nodetool-workflows), [jobs](docs/harnesses.md#nodetool-jobs), [assets](docs/harnesses.md#nodetool-assets) |
| Scripts and storyboards | [Script/storyboard link design](docs/script-storyboard-link/design.md), [script voicing](docs/harnesses.md#script-voicing-tools-no-workflow-no-browser), [storyboard rendering](docs/harnesses.md#storyboard-render-tools-no-workflow-no-browser) |
| 3D scenes and games | [3D tools](docs/harnesses.md#3d-scene-tools-no-editor-no-browser), [Godot pipeline](docs/harnesses.md#godot-game-pipeline-templates-slot-nodes-project-export), [game flow](docs/harnesses.md#game-flow-guided-build-design-graph-export) |
| Entities and media | [Entity library](docs/harnesses.md#entity-library-tools-no-browser), [media analysis](docs/harnesses.md#media-analysis-tools-no-model-no-ffmpeg), [timeline previews](docs/harnesses.md#nodetool-timeline-validate--debug-timeline-harness) |
| Chat and remote deployment | [Chat](docs/harnesses.md#nodetool-chat), [deployment and workers](docs/cli.md#deployment-and-workers) |

Selfcheck mappings live in the [harness registry](packages/cli/src/harness/registry.ts).

### In-Browser Workflow Harness

The real-backend graph harness records canvas rendering, IO, traces, and
screenshots. From `web/`, use `npm run test:e2e-runner` or
`npm run test:e2e-runner:headed`. It also backs `nodetool debug --browser` and
`npm run test:debug-harness`. See [runner guide](web/src/e2e_runner/README.md).

For web E2E, build backend packages, then run `npx playwright install chromium`
and `npm run test:e2e` from `web/`. Playwright starts the servers. See
[Testing](web/TESTING.md). Electron main-process tests use Jest in
`electron/src/__tests__/` (`npm test` from `electron/`), with no Playwright suite.

## Observing Agent Execution

Runs emit an OpenTelemetry span tree with token usage and
`gen_ai.usage.cost_usd` on LLM spans. Use `--trace-file <f.jsonl>` or
`--trace-stdout pretty|json` on CLI runs, or `NODETOOL_TRACE_*` / OTLP variables.
See [span hierarchy and sinks](docs/harnesses.md#observing-agent-execution).

## Security

Follow [Security](docs/DEVELOPMENT_STANDARDS.md#16-security) and
[Electron Security](docs/DEVELOPMENT_STANDARDS.md#12-electron-39-security).

- Outbound fetches of URLs chosen by callers, providers, or models must use
  `safeFetch` or `fetchExternalMedia` from `@nodetool-ai/runtime`. A predicate
  checking the initial URL does not validate redirects. Maintain the
  [URL Egress Inventory](docs/url-egress-inventory.md). Its audit is
  `packages/runtime/tests/url-egress-audit.test.ts`.
- Code scanning uses GitHub default setup. `.github/codeql/*.yml` does not
  configure it. Dismiss false positives in the Security UI and test the premise
  that makes them false, as in `packages/models/tests/access-token.test.ts`.
  Custom exclusions require advanced setup with an explicit `config-file:`.
