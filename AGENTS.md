# NodeTool — Agent Rules

Visual AI workflow platform. TypeScript monorepo with React frontend, Electron
desktop app, and Node.js backend.

This file is the single source of truth for agents working in this repository:
architecture, commands, harnesses, and linter-like rules. `CLAUDE.md` is a macro
that points here — never put content there.

Every directory with an `AGENTS.md` carries a sibling `CLAUDE.md` holding the
single line `@AGENTS.md`, and every `AGENTS.md` is reachable by link from this
one (directly, or through `packages/AGENTS.md` for a per-package overlay).
`npm run check:agents-docs` enforces all of it: a new `AGENTS.md` needs its
`CLAUDE.md` and a navigation entry in the same PR.

> When the architecture, commands, or rules below drift from the codebase,
> update this file in the same PR. **No stats and nothing ephemeral**: no
> counts of packages, nodes, tools or lint findings, no dates, no eval scores,
> no "currently"/"today"/"as of" status. Those are stale the day after they are
> written and an agent cannot tell a stale number from a true one. Point at the
> command that measures instead.

> **Canonical standards live in [docs/DEVELOPMENT_STANDARDS.md](docs/DEVELOPMENT_STANDARDS.md).**
> That document is the single source of truth for enforceable rules and
> aspirational targets across TypeScript, React, Zustand, MUI, TanStack Query,
> ReactFlow, Fastify, Drizzle, Zod, Electron security, accessibility,
> performance, security, observability, error handling, git/PR hygiene, and
> dependency management. The rules in this file are the area-specific overlay —
> read both.

## Communication Style

You and I maintain a no-bs, clear concise, actionable relationship.
Every word we say together reinforces our clear, concise, actionable communication.
We're here to solve problems and create value, and our communication reflects that.
Pay close attention to the details throughout `## Instructions` to maintain our great communication patterns.
Why? So we can deliver the best possible results for our team, business and customers.

## Instructions

### 1. Positive Patterns and Negative Patterns

Replicate the `#### Positive Patterns` as behavioral references. Avoid the `#### negative Patterns`.

#### Positive Patterns

- I always see the last thing you write first. Place the most important information there.
- Use plain, specific language.
- State each fact once.
- Match the level of detail to the level of task and request.
- Challenge incorrect assumptions directly and explain why.
- Optimize for clarity and engineering value, not quotability.
- Use the simplest domain terminology that compresses information.
- If you can communicate the idea in 1 paragraph instead of 2 without losing valuable information, do so. Same idea for 1 sentence vs 2 sentences.
- Don't use overloaded terms that could mean more than one thing. Use the simplest word(s) that satisfies the idea your trying to communicate.

#### Negative Patterns

- Avoid words, and phrases in this list:
    - "load-bearing"
    - "worth stating plainly"
    - "here's the honest truth"
    - "the real tension"
    - "carry the argument"
- Avoid analogies. Discuss what's right in front of us.
- Do not over use em dashes or dash chaining.
- Do not flatter, praise, validate, or agree without reason.
- Do not use decorative headings, emoji, or motivate language.
- Avoid semicolons, fragments, and non-standard punctuation.
- Do not repeat yourself. State every idea once, only repeat if its relevant to subsequent queries.

### 2. Reference Points

We use reference points to communicate quickly with each other.

- Use numbered lists and markdown headings when the improve navigation.
- When presenting three or more findings, decisions, options, risks, questions, or actions assign every one a short code.
    - Use `D1`, `D2`, `DN` for decisions.
    - Use `O1`, ... for options.
    - Use `F1`, ... for findings.
    - Use `R1`, ... for risks.
    - Use `Q1`, ... for questions.
    - Use `A1`, ... for actions.
    - Invent new references for sections we don't have.
    - Preserve the same codes throughout the conversation.
    - Do not create codes for short simple answers.

### 3. Hard Operational Boundaries

In addition to clearly communicating. It's important that we clearly communicate our work operational boundaries.

- Deliver only what was requested at the intended scope.
- Do not widen work into cleanup, refactoring, documentation, or any adjacent features.
- Do not speculate on abstractions for future requirements.
- Do not claim completion without evidence.
- Never add a co-author to a commit message.
- For completed work, concisely restate it but do not overload with response detail.

### 4. Aliases

Aliases are reminders of great communication and patterns we want to upload.
When you see these exact aliases, expand them and act as if their expansions were given to you directly.
If these are referenced in a longer string, they are not aliases, do not expand.

scr = `Simplify, compress, and repeat your response.`
eli = `Explain this like I'm 18. Simplify your language. Shorten your response.`
foc = `Focus on what matters most here. Whats the true signal? Whats the true value? Boil your response down into the most important thing we need to focus on.`
ref = `Rewrite your responses with reference points`

### Examples

Here are concrete examples of how we DO and DO NOT communicate together. 
Replicate how we DO communicate together and avoid how we DO NOT communicate together.

#### Simple Investigation
User: `Is legacy-config.json still referenced?`

To do:
```text
No. The only match is the file itself.
```

Not to do:
```text
Great question. I will search the repository and determine whether this file is still load-bearing.
After a comprehensive review, the answer is no. I can also remove it and inspect adjacent files if you would like.
```

#### Engineering Recommendation
User: `Should we add redis to this system`

To do:
```text
Do not add Redis here. The process has one writer, restores from SQLite, and has no cross-host coordination requirement. 

Redis adds a failure domain without solving a current constraint.
```

Not to do:
```text
You are absolutely right that Redis could help. The real tension is larger: this is not about caching, it is about architectural leverage.
```

#### Summarizing a blog
User: `Summarize the blog: <>`

To do:
```text
The whole essay rests on one idea: safety comes from balance of power, not from alignment technology. Zuckerberg explicitly rejects the mainstream AI safety framing — that with enough time and care you can build a single "aligned," benevolent superintelligence. 

His counterargument is that humanity isn't a monoculture; any singular superintelligence would have to prioritize some people's values over others, so "there is no such thing as a singular benevolent superintelligence.".

The safe path, in his view, is the same one liberal democracies use: give everyone power so competing interests naturally check each other.
```

Not to do:
```text
Here's a breakdown of Mark Zuckerberg's "The Future is for
Everyone" (Aug 10, 2026) — Meta's superintelligence manifesto.

The core thesis

Three claims form the spine of the whole piece:

1. Individual empowerment is the source of prosperity — progress
comes from the Wright brothers, Faraday, Jobs in a garage; not
from institutions.
2. Invention, not automation, is superintelligence's purpose — a
person can only ask so many questions per day, but the number
of things AI can invent for you is unbounded.
3. Balance of power is the foundation of safety — not alignment,
not caution. Distribution.

Everything else in the document is downstream of these.
```


## Quick Navigation

- **[Development Standards](docs/DEVELOPMENT_STANDARDS.md)** — **Canonical standards for the whole repo (MUST READ).**
- **[Design System](docs/DESIGN.md)** — **Design token rules: SPACING, TYPOGRAPHY, BORDER_RADIUS, MOTION, Z_INDEX (MUST READ for any UI work).**
- **[UI Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md)** — Primitives-first policy, decision tree, migration rules (MUST READ for frontend work)
- **[Harness-First Engineering](docs/HARNESS_FIRST.md)** — The doctrine: every surface headlessly drivable, the registry, `nodetool harness audit`
- **[Agent Harnesses & Tooling](#agent-harnesses--tooling)** — Validate, debug, run, single-node, browser, deploy, trace (the tools that close the build→verify loop)
- **[Harness Reference](docs/harnesses.md)** — Every harness and agent tool surface in full: flags, what it simulates, the design behind it. CLI flags: [docs/cli.md](docs/cli.md)
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

---

## Architecture

```
packages/           # npm workspace packages (TypeScript backend)
  protocol/         # Shared message types — base dependency for everything
  config/           # Configuration loading, logging
  security/         # Secret storage, encryption
  auth/             # Authentication middleware
  storage/          # File storage (local, S3)
  models/           # SQLite data models (Drizzle ORM)
  node-sdk/         # BaseNode class, NodeRegistry, type system
  runtime/          # ProcessingContext, LLM providers, message queue, Workspace
  kernel/           # Workflow graph, Actor runtime, WorkflowRunner
  agents/           # Planning agent system (TaskPlanner → TaskExecutor → CodeActExecutor)
  chat/             # Chat message processing, token counting
  base-nodes/       # Shell re-exporting the domain node packages (core-nodes,
                    # text-nodes, llm-nodes, image-nodes, …) as ALL_BASE_NODES
  browser/          # One real Chrome page over CDP: the action loop, media
                    # capture, upload, and the Chrome-extension relay that
                    # reaches the user's own signed-in browser
  websocket/        # Fastify HTTP + WebSocket server (main API, port 7777)
  cli/              # nodetool CLI
  vectorstore/      # SQLite-vec for RAG
  app-runtime/      # Mini-app document, bindings, instance state, streaming fold
                    # (shared by web, the CLI `app debug` harness, and mobile)
  model-pricing/    # Unit price for a selected FAL/kie/GenSpend model (web + runner)
  model3d/          # glTF scene document: read/write, primitive geometry, the
                    # editor's scene ops, validation (web + model3d capabilities)
  sandbox-compiler/ # Compiles a pack's npm dependency into a guest module
                    # (esbuild bundle, scope-aware scan, QuickJS admission probe)
  sandbox-packs/    # Shipped library packs — config-only manifest + SKILL.md each,
                    # NOT workspaces: installed and imported by the guest only
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
- **UI Primitives (MANDATORY)**: All frontend UI must use primitives from `web/src/components/ui_primitives/`. **Never import raw MUI components** (`Typography`, `Button`, `IconButton`, `Tooltip`, `CircularProgress`, `Chip`, `Dialog`, `Alert`, `Divider`, `Paper`, etc.) outside of `ui_primitives/` or `editor_ui/`. See the **[Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md)** for the decision tree, migration rules, and the full primitive catalog. When touching any file, migrate raw MUI usage to primitives.
- **Media rendering (MANDATORY)**: `asset://<id>` is a stored identifier, not a URL — the bytes live under `<user_id>/<asset_id>.<ext>` and, on the cloud backends, behind a signed URL only the server can mint. Never set `src`/`poster` from a locator. Render stored media through `ResponsiveImage`, `VideoPlayer`, or `AudioPlayback` with a `locator` prop; those primitives resolve it. Their `src` prop takes a `ResolvedMediaUrl`, minted only by `utils/resolveMediaUri.ts` and `hooks/useResolvedMediaUri.ts`, so a raw string does not typecheck. The lint rule `design-tokens/no-unresolved-media-src` rejects a locator literal in a JSX url attribute; the rendering surfaces are inventoried in `web/src/__tests__/mediaResolutionBoundary.test.ts`.
- **Design tokens (MANDATORY)**: See **[docs/DESIGN.md](docs/DESIGN.md)** for the token systems — `SPACING` (4px grid), `TYPOGRAPHY` (4-size scale), `BORDER_RADIUS`, `MOTION`, `Z_INDEX`. **Never** hardcode border radii (`4`, `10`, `18px`), transition strings (`"all 200ms ease"`), font sizes (`"14px"`, `"0.85rem"`), or off-grid spacing (`5px`, `10px`, `13px`). Use the named constants from `ui_primitives`. When touching any UI file, fix violations in the same PR.
- **Styling**: MUI v7 + `sx` prop for one-off, `styled()` for reusable. Theme values only, no hardcoded colors/spacing. Prefer `FlexRow`/`FlexColumn` over `Box sx={{ display: "flex" }}` when the shorthand props (`gap`, `align`, `justify`) reduce verbosity; use `Box` directly when you have significant additional `sx` overrides anyway.
- **Node graph**: ReactFlow 12. Nodes extend `BaseNode` from `@nodetool-ai/node-sdk`.
- **Workspace access goes through an interface, never a path**: a run's files live behind `context.workspace` (`Workspace` in `@nodetool-ai/runtime`) — `read`/`write`/`list`/`stat`/`copy`/`move`/`delete` over workspace-relative paths. A local install backs it with a folder, a cloud deployment with a key prefix in the asset bucket (`NODETOOL_WORKSPACE_STORAGE`), and no caller branches on which. `workspace.localDir` is null on a virtual workspace and is only for code that genuinely needs a real directory: a host binary stages through `materialize`/`absorb` + `scratchDir`, and the nodes that hold a live file (`lib.sqlite`) say they need a local workspace instead of silently losing writes. `context.workspaceDir` survives as the derived local path and is deprecated.
- **LLM providers**: All in `packages/runtime/src/providers/` — Anthropic, OpenAI, Gemini, Ollama, Mistral, Groq, Claude Agent SDK
- **Agent system**: `packages/agents/` — full planning agent (TaskPlanner → DAG of Steps), TaskExecutor/ParallelTaskExecutor (walk the DAG), CodeActExecutor (sandboxed-JavaScript action loop for one step)
- **Workflow execution**: Actor-model in `packages/kernel/` — DAG-based, message-passing between node actors
- **Python bridge**: `PythonStdioBridge` in `packages/runtime/` — spawns `python -m nodetool.worker --stdio`, communicates via length-prefixed msgpack over stdin/stdout. Lazy-connected on first workflow with Python nodes.
- **Serialization**: MsgPack for WebSocket messages, JSON for REST API
- **ES Modules**: All packages use `"type": "module"`. Imports need `.js` extension in compiled output.

---

## Prerequisites

- **Node.js 22.22.1** (required — see `.nvmrc`). Matches Electron 39's embedded Node (22.22.1). The one source-built native module (`better-sqlite3`) is rebuilt against the Node ABI by the root `postinstall` hook (`electron/scripts/rebuild-native.mjs`), which runs after `npm install`/`npm ci` finishes reifying the tree.
- Use `nvm use` to activate the correct version.
- If you see `NODE_MODULE_VERSION` errors, run `npm run rebuild:native`.
- **Fresh checkout or missing `node_modules`**: if `npm run typecheck`/`lint`/`test` fail with module-resolution errors (`Cannot find module`, `Cannot find type definition file`) on files you didn't touch, run `npm install` first — don't spend a cycle proving the failure predates your change. Re-run the checks after install before investigating further.
- Python 3.11+ with conda is optional — needed only for Python nodes.

### First-time setup

`start.sh` does all of it, then starts the server:

```bash
./start.sh           # API on :7777   (full | web | check | doctor)
```

Or by hand:

```bash
nvm use                 # Reads .nvmrc, activates Node 22.22.1
npm install             # Install all workspace dependencies
npm run build:packages  # Build backend packages
```

In Claude Code **web** sessions, `.claude/hooks/session-start.sh` installs
dependencies before the session starts, so `npm run typecheck`/`lint`/`test`
work immediately. Slash commands: `/serve`, `/verify`, `/onboard`. See
[.claude/README.md](.claude/README.md).

Locked-down containers (`npm install` fails in postinstall) and machines
without a Vulkan driver ("No WebGPU adapter available") each need one extra
step: [docs/dev-environment.md](docs/dev-environment.md).

## Build, Lint & Test Commands

### All Packages

Run these from the repo root. After **any** code change, `npm run check` (or the
checks it wraps) must pass.

```bash
npm install              # Install all dependencies (web, electron, mobile)
npm run build            # Build all packages
npm run typecheck        # Type check web, electron, and mobile
npm run lint             # Lint packages/*/src, web/src, electron, mobile/src
npm run lint:fix         # Auto-fix linting issues
npm run lint:anti-slop   # anti-slop backlog rules — report-only, not part of `lint`
npm run test             # Run web, electron, and mobile tests
npm run test:affected    # Only the suites that depend on changed code
npm run check            # Workspace/lockfile/boundary checks, build:packages,
                         # typecheck, lint, test:packages, test
```

The vendored [anti-slop](https://github.com/dmmulroy/anti-slop) Oxlint plugin
runs through two configs: `.oxlintrc.anti-slop.json` is the **backlog**
(`npm run lint:anti-slop`, not on the CI path) and
`.oxlintrc.anti-slop-enforced.json` holds every (rule, tree) pair already at
zero, inside `npm run lint` so it cannot come back. The override blocks are
generated (`lint:anti-slop:count|targets|write|check`), never hand-edited, and
a count never goes in a doc. How to work a rule down, and why some are
stalled: [tools/oxlint/anti-slop/README.md § Working the backlog](tools/oxlint/anti-slop/README.md#working-the-backlog).

### Backend Packages

```bash
npm run build:packages                          # Build all in dependency order
npm run test:packages                           # Test all packages
npm run test --workspace=packages/<name>        # Test single package
npm run test:watch --workspace=packages/<name>  # Watch mode for single package
```

### Web, Electron, Dev Servers

```bash
cd web && npm start|build|typecheck|lint|test|run test:e2e   # e2e needs the backend
cd electron && npm start|build|typecheck|lint|test
npm run dev                 # Backend (tsx --watch) + web Vite server
npm run dev:server          # Backend only (port 7777)
npm run electron:dev        # Electron against Vite server (requires conda env)
```

### Mandatory Post-Change Verification

After **any** code change, run these three — and only these three:

```bash
npm run test:affected # Only the suites that depend on what changed
npm run typecheck     # Type check web, electron, and mobile
npm run lint          # Lint packages/*/src, web/src, electron, mobile/src
```

All three must pass before the task is complete. Do not reach for the full
`npm run test` + `npm run test:packages` pass instead: it is minutes of wall
clock on a two-file change, and CI runs it on the PR anyway.

`npm run test:affected` maps the diff — committed since the merge-base with
`origin/main`, plus the working tree — onto workspaces with the same
`computeAffected` behind `nodetool affected`, then runs:

- the affected backend packages through `turbo run test`, so their dependencies
  still build (`test` dependsOn `^build`);
- `jest --findRelatedTests` in web/electron/mobile when only that app's own
  files changed — the tests that actually import them;
- an app's whole suite when a package it depends on changed. Jest's dependency
  graph stops at the workspace root, so a change inside
  `node_modules/@nodetool-ai/*` is invisible to `--findRelatedTests`;
- everything, when a changed file belongs to no workspace and is not
  documentation (root configs, `scripts/`, the lockfile).

```bash
npm run test:affected                              # the current diff
npm run test:affected -- --dry-run                 # print the plan, run nothing
npm run test:affected -- --base <ref>              # diff against another ref
npm run test:affected -- packages/kernel/src/x.ts  # ask what a given file selects
npm run test:affected -- --all                     # the full pass, when you want it
```

The selection rules are `buildPlan` in `scripts/test-affected.mjs`, pinned by
`scripts/__tests__/test-affected.test.mjs` (run by `npm run test:packages`) —
a mis-selection is silent, so changing a rule means changing that test.

`lint` passing is not `test` passing: a change to `packages/websocket` that was
linted and never tested broke two route suites, and CI found it rather than the
author. And selection is only as good as the declared dependency graph — when a
change crosses a seam the graph does not record (a fixture read from another
package, a generated file), run the suites you know it reaches by hand.

### Claims, Checks, and Measurements

Verification failures in this repo are rarely "forgot to run the tests". They
are green signals that were never earned. Four rules, each paid for:

**Prove a new check can fail.** Invert the condition once and watch it go red,
then restore. `nodetool validate` returned ✅ on a workflow whose model id was
`totally-not-a-real-model-xyz` — it had never checked ids at all, and only a
deliberately-bogus input revealed it. A check that has only ever been green is
indistinguishable from one that examines nothing. For an audit that scans
files, also assert it *found* something, so it cannot pass by matching nothing.
This is rule 7's sibling in [docs/HARNESS_FIRST.md](docs/HARNESS_FIRST.md).

**Reproduce before you enforce.** Rule 5 requires a bug *fix* to ship a
reproduction; the same applies to a new *rule*. A validator check was written
from a log warning plus code reading, shipped as an error, and would have failed
the examples gate on six shipped workflows — until three reproductions of its
own criterion passed cleanly and the feature was reverted. Until you have
watched the failure, report it; do not enforce it.

**"I checked" means you enumerated.** Not one plausible file, and never a
comment — a comment is a hypothesis about code, not the code. Claims that
`validateGraph` was ungated in CI, and that six call sites were safe, were both
made from a sample and both wrong in method. To assert "all X do Y", produce the
list; if that is too expensive, scope the claim to what you actually read.

**Distrust the measurement before the conclusion.** `pgrep -f` matches the
shell command that contains the pattern, so a probe can report a dead process as
running. `cmd | head && echo ok` prints `ok` on failure, because `head` exits 0 —
capture the exit code of the command you care about. When a result is surprising,
re-measure with a different tool before believing it.

Two mechanical traps worth naming: after a programmatic edit, byte-count the
file for stray control characters (a `\u0000` written as the byte it denotes
got a `.ts` file staged as **binary**), and if the code walks a graph or list,
run it once on a large input — an `edges.some()` inside a node loop is O(n·m)
and passed every hand-written fixture before timing out on the 20 000-node
chain in CI.

## Common Pitfalls

- **base-nodes, node-sdk, fal-nodes, replicate-nodes, elevenlabs-nodes** use decorators and load from `dist/`. After changing these, run `npm run build:packages` before `npm run dev`.
- **Package build order matters**. Use `npm run build:packages` which builds in dependency order, not `npm run build` on individual packages that have unbuilt dependencies.
- **Deploy = the GHCR image, self-contained**. The prod server runs on **Fly.io** (`fly.toml`, app `nodetool`, https://nodetool.fly.dev / https://api.nodetool.ai). The deploy unit is the GHCR image built by `.github/workflows/docker.yml`; `web/dist` and workflow examples are baked into it (no host bind-mount). A push to `main` builds the image (`docker.yml`) and then auto-deploys it to Fly (`fly-deploy.yml`), so both backend and frontend changes ship in a new image. Migrations run once per release via Fly's `release_command` (see `fly.toml`). Because `docker.yml` runs only after a merge, the Quality Gate carries a `docker` leg that builds the image on the PR, boots it, and loads the app in a browser (`scripts/docker-smoke.mjs`) — run it locally against any server with `node scripts/docker-smoke.mjs http://localhost:7777`. The container needs `--network host`: in `local` auth mode the server trusts only loopback *inside* the container, so behind a published port every API call answers 401.
- **Self-hosting** (outside Fly) uses `docker-compose.yml` (reference compose) or the `packages/deploy` tooling. The old self-hosted `deploy.sh`/`npm run redeploy` box was decommissioned once Fly took over.
- **Packaged Electron backend flattens file paths**. esbuild bundles the backend into one `server.mjs`, so anything resolved relative to `import.meta.url` (provider `*-manifest.json`, examples, `package://` assets) lives elsewhere in the packaged app than in dev. Data files a package loads at runtime must be declared in `PACKAGE_RUNTIME_ASSETS` (`packages/config/src/package-asset-registry.ts`) and loaded via `loadPackageAssetJson` from `@nodetool-ai/config` — the registry drives staging (`scripts/bundle-backend.mjs`) and artifact verification (`scripts/verify-backend-bundle.mjs`), and unregistered loads throw in dev. See [electron/src/AGENTS.md § Packaged file layout](electron/src/AGENTS.md).
- **The packaged backend only resolves what `bundle-backend.mjs` stages, in a flat `_modules/`**. One version per package name wins, so a dependency npm hoisted for an older major can take the slot a newer one needs — invisible in dev, fatal in the artifact. `npm run backend:smoke` stages the bundle and boots `server.mjs` against `/health`; run it after touching `scripts/bundle-backend.mjs`, a native dependency, or anything the backend loads lazily. CI runs it as the Quality Gate `bundle` leg and again per-OS in `release.yaml`.
- **Price catalogs are generated — never hand-edit them.** FAL/kie come from `packages/fal-codegen`; `packages/model-pricing/src/generated/genspend-pricing.json` covers every other provider and comes from the GenSpend catalog, refreshed by the nightly `GenSpend Pricing Sync` workflow (`npm run sync:genspend` locally after `build:packages`, `npm run sync:genspend:check` to see whether it is stale). The sync matches GenSpend models against the models each provider enumerates in NodeTool, so it never emits an id NodeTool doesn't ship; unmatched models are reported, and `scripts/genspend/aliases.json` is where a maintainer pins or blocks one. The job opens a PR when a price moved — a number that gates a run's budget gets reviewed, not auto-merged. See [packages/model-pricing/README.md](packages/model-pricing/README.md).
- **Generated provider metadata has a drift gate.** The FAL and KIE generators normally read live schemas and live pricing, so their output is not reproducible. `npm run generate:fal:check` / `generate:kie:check` run the same generators in fixture mode — only the schema fixtures checked in under `packages/{fal,kie}-codegen/fixtures/`, no network, no pricing, no timestamps — into a temporary directory, and diff the outputs the generator manifest declares against `fixtures/expected/`. Any difference exits non-zero, as does a check that compared nothing. Refresh an intended change with `node scripts/provider-codegen-check.mjs --provider <fal|kie> --write`. `.github/workflows/provider-codegen.yml` runs both on every diff touching a codegen package. Live refresh stays `npm run generate:fal` / `generate:kie`.
- **WebSocket messages use MsgPack**, not JSON. Use the existing serialization helpers.
- **Don't create new WebSocket instances** — use `GlobalWebSocketManager` singleton.
- **Mobile typecheck** requires building protocol first: `cd packages/protocol && npm run build`. The one shared package mobile compiles from **source** (no build) is `@nodetool-ai/app-runtime`, wired in `mobile/metro.config.js`, `tsconfig.json` and `jest.config.js` — all three must agree.
- **`mobile/` is intentionally NOT a root workspace** (it has its own Expo/React Native dependency tree that must not be hoisted). Its scripts use `npm --prefix mobile …`, not `npm --workspace=mobile …` — the latter will fail. Do not "standardize" these to `--workspace`.
- **`npm install` fails in sandboxed/proxied environments** (`keytar` headers, `electron` and `onnxruntime-node` binary downloads; one failed postinstall rolls back the whole tree). `npm install --ignore-scripts` for lint/typecheck-only work. Details: [docs/dev-environment.md](docs/dev-environment.md).
- **"No WebGPU adapter available (Node/Dawn)" is a missing driver, not a broken test.** Shader-backed image nodes need a Vulkan ICD; CI installs `mesa-vulkan-drivers` (lavapipe) and the same test passes there. Do not skip a test over it. Setup with and without root: [docs/dev-environment.md](docs/dev-environment.md#webgpu-on-a-headless-machine).
- **The `better-sqlite3` rebuild runs from the root `postinstall`, not the electron workspace's.** That one fired mid-reify and raced npm's renames of node-gyp's deps (intermittent `Cannot find module 'tinyglobby'`). A clean `npm ci` is the whole install; `npm run rebuild:native` forces a rebuild.
- **Claude Agent Provider in nested sessions (e.g. Claude Code web)**: The SDK spawns the bundled native `claude` binary as a subprocess. In environments like Claude Code on the web (`claude.ai/code`), you must: (1) strip all `CLAUDE_CODE_*` / `CLAUDE_SESSION_*` / `CLAUDE_ENABLE_*` / `CLAUDE_AFTER_*` / `CLAUDE_AUTO_*` env vars — not just `CLAUDECODE`; (2) run as a non-root user — the SDK refuses `--dangerously-skip-permissions` when uid=0; (3) keep `ANTHROPIC_BASE_URL` and `HTTP_PROXY`/`HTTPS_PROXY` vars for API routing. See `docs/AGENTS.md` § Claude Agent SDK for full details.
- **ES Modules everywhere**: all packages use `"type": "module"`. Compiled imports need `.js` extensions.
- **Never import from `dist/`**: use `@nodetool-ai/<package>` workspace references in source code.

---

## Agent Harnesses & Tooling

The repo ships harnesses built for the agent edit→verify loop: check a workflow
before running it, run it and read everything it emitted, run a single node in
isolation, drive the real browser, deploy, and trace token/cost. Reach for these
before hand-rolling a script. Every CLI command runs from source with
`npm run dev:nodetool -- <cmd>` (no build) or from `dist` with
`npm run nodetool -- <cmd>` after `npm run build:packages`. The full flag
reference is [docs/harnesses.md](docs/harnesses.md) plus [docs/cli.md](docs/cli.md).

| Need | CLI harness | Agent/MCP tool | Speed |
|---|---|---|---|
| Static pre-flight (unknown nodes, missing props, bad edges) — **run this first** | `nodetool validate <id\|file.json\|file.ts>` | `validate_workflow` (inline `graph` or `workflow_id`) | < 1 s, no DB for file targets |
| Run a workflow end-to-end and read every message/log/output/error | `nodetool debug <id\|file>` (server surface, default) | `debug_workflow` (status + outputs + errors + job logs + graph in one call) | seconds |
| Build a mini app from a prompt and verify it end to end | `nodetool app build "<prompt>" -p <provider> -m <model>` | `create_app` + `edit_app` (the `ui_app_*` steps), graded with `debug_app` | minutes |
| Real-browser surface (Playwright + Chromium canvas), trace, per-stage shots | `nodetool debug <id> --browser --trace --stages` | — | tens of seconds (opt-in) |
| Tight edit→verify loop on a file target | `nodetool debug file.ts --watch` (prints a verdict **diff** per save) | — | per-save |
| Run one node in isolation with a prop bag | `nodetool node run <type> --props '{…}' [--no-secrets]` | — | sub-second hermetic |
| Run a workflow (id, JSON, or DSL `.ts`) | `nodetool run <file>` / `nodetool workflows run <id> [--params …]` | `run_workflow`, `start_background_job` | varies |
| Map changed files → minimal workspaces to rebuild/test | `nodetool affected [--base main]` | — | instant |
| Run only the suites that depend on changed code (the pre-commit test pass) | `npm run test:affected [-- --dry-run]` | — | seconds–minutes |
| Ask whether the product let an agent finish a real job, and keep the transcript | `nodetool jtbd run` / `jtbd optimize` | — | minutes |
| Check that every agent capability names a check | `nodetool harness capabilities`; `npm run capabilities:check` | — | seconds |
| Check a provider's live response against the decoder that reads it | `npm run probe:providers` (nightly; offline half runs on every provider diff) | — | seconds |
| Author/inspect a graph against the live registry | — | `create_workflow`, `search_nodes`, `list_nodes`, `get_node_info`, `get_example_workflow`, `export_workflow_digraph` | — |
| Check a script↔storyboard link (extract, scaffold, joint assemble) | no command of its own — the pure-function suites the `script-storyboard-link` harness entry names, run by `harness gate` on diffs touching either surface | `get_storyboard`, `get_script` (link state, drift, orphans), `validate_timeline` on the assembled output | seconds |
| Build or fix a 3D scene with no editor open | no command of its own — the `capability-suites` selfcheck the `model3d` harness entry names | `list_model3ds`, `create_model3d`, `get_model3d`, `edit_model3d`, `validate_model3d` | sub-second |
| Season a prompt with the entity library | no command of its own — the `capability-suites` selfcheck the `entities` harness entry names | `list_entities`, `get_entity`, `apply_entities` | sub-second |
| Measure a clip instead of watching it — duration, loudness, frequency content, motion, cuts | no command of its own — the `capability-suites` selfcheck the `agent-capabilities` harness entry names | `analyze_audio`, `analyze_audio_spectrum`, `detect_audio_events`, `analyze_video`, `detect_video_scenes` | seconds, no ffmpeg |
| See what a timeline looks like at a timecode — tracks layered, animations mid-flight, transitions part way, text drawn | no command of its own — the `capability-suites` selfcheck the `agent-capabilities` harness entry names | `preview_timeline_frame` (composited frames + per-layer opacity/z-order/wipe), then `view_image` | seconds, no GPU or browser |
| Jobs & assets | `nodetool jobs …` / `nodetool assets …` | `list_jobs`, `get_job`, `get_job_logs`, `list_assets`, `get_asset` | — |
| What a media generation cost, where its asset is, whether it is still running | `nodetool generations list\|get\|await\|cancel\|reconcile\|sweep` | `list_generations`, `get_generation`, `await_generation`, `cancel_generation`, `reconcile_generation`; `background: true` on the generation capabilities | instant |
| Agent/chat REPL (one unified agent loop, no mode to select) | `nodetool-chat` (`npm run dev:chat`) | — | — |
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

Every harness above has a full entry — flags, what it simulates and what it
does not, the design behind it — in [docs/harnesses.md](docs/harnesses.md),
and the CLI flag reference is [docs/cli.md](docs/cli.md). Read the entry
before driving a harness you have not used in this session.

## Observing Agent Execution

Every run emits an OpenTelemetry span tree (`workflow.run` → `node.process` →
`agent.execute` → `agent.plan`/`agent.step` → `llm.chat`/`llm.stream`) with
tokens and `gen_ai.usage.cost_usd` on every LLM span. Sinks: `--trace-file
<f.jsonl>` / `--trace-stdout pretty|json` on any CLI run, or the
`NODETOOL_TRACE_*` / OTLP env vars. Span hierarchy, JSONL schema, and sinks:
[docs/harnesses.md § Observing Agent Execution](docs/harnesses.md#observing-agent-execution).

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
- All inter-package imports use `@nodetool-ai/<package>`. Never import from `dist/`.
- Frontend tools are prefixed `ui_` (e.g. `ui_add_node`).

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
- See the **[Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md)** for the full decision tree, migration rules, and the available primitives.
- When touching any component file, **opportunistically migrate** raw MUI usage to primitives.
- Replace `display: "flex"` / `flexDirection` patterns with `FlexRow` / `FlexColumn` layout primitives.
- Replace `<Typography>` with `Text`, `Label`, or `Caption` primitives.
- Replace `<CircularProgress>` with `LoadingSpinner`. Replace `<Tooltip>` with `Tooltip` primitive.
- Use `sx` prop for one-off styles on primitives. Use `styled()` only inside `ui_primitives/` for defining new primitives.
- Use theme values for spacing, colors, and typography — never hardcode hex colors or pixel values.
- Prefer composition over deep prop drilling.
- If no primitive exists for your use case, **create a new primitive** in `ui_primitives/` rather than using raw MUI.
- Render stored media (`asset://`, a `*Ref`) with `ResponsiveImage` / `VideoPlayer` / `AudioPlayback` and a `locator` prop — never a raw `<img>`/`<video>`/`<audio>` whose `src` is a locator. See [STRATEGY.md § Media](web/src/components/ui_primitives/STRATEGY.md).

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

- Tests live in `__tests__/` directories. Vitest for `packages/`, Jest for `web/` and `electron/`.
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

### Electron Tests

The Electron workspace has no Playwright suite — the main process is covered by
Jest tests in `electron/src/__tests__/`.

```bash
cd electron
npm test
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
- Any outbound fetch of a URL somebody else chose — a media ref, a provider's
  result body, a model's answer — goes through `safeFetch` (or
  `fetchExternalMedia` for media refs) from `@nodetool-ai/runtime`, never a bare
  `fetch`. A predicate can refuse the first URL; only the protected fetch
  re-checks each redirect hop. Every such surface is inventoried in
  [docs/url-egress-inventory.md](docs/url-egress-inventory.md) and audited by
  `packages/runtime/tests/url-egress-audit.test.ts`, which fails on a new
  unclassified `fetch(url)` anywhere under `packages/*/src`.
- `npm audit` must pass — high/critical advisories block merge unless waived with rationale.
- Code scanning runs GitHub's **default setup**, configured in repo settings. A
  `.github/codeql/*.yml` config file is inert: only advanced setup reads one,
  and that needs a workflow passing `config-file:` to
  `github/codeql-action/init`, which this repo does not have. So there is no
  per-query or per-path exclusion to reach for — suppress a false positive by
  dismissing it in the Security UI, and pin the premise that makes it false in a
  test (as `packages/models/tests/access-token.test.ts` does) so it fails when
  it stops holding.

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

> Full guide: [docs/WRITING_STYLE.md](docs/WRITING_STYLE.md). Brand voice and messaging: [docs/BRAND.md](docs/BRAND.md). Comment/README rules: [DEVELOPMENT_STANDARDS §19](docs/DEVELOPMENT_STANDARDS.md#19-documentation--comments).

- Write prose — docs, READMEs, this file, PR descriptions, comments — concise and concrete. Cut any sentence that survives deletion without losing meaning.
- **No AI slop.** Forbidden: `leverage`, `utilize`, `seamless`, `robust`, `powerful`, `comprehensive`, `cutting-edge`, `unlock`, `empower`, `streamline`, `it's worth noting`, `dive into`, rule-of-three padding, "it's not just X, it's Y", emoji decoration, and the rest of the [forbidden list](docs/WRITING_STYLE.md#forbidden-expressions).
- Bold-label bullets must add information beyond the label. Claims are concrete: numbers, names, paths — not adjectives.
- **User-facing copy also follows [docs/BRAND.md](docs/BRAND.md).** Lead with the outcome, not the node graph. Never `credits`/`tokens` for billing (say `provider rates`, `at cost`), never `chatbot` for the agent, never `powered by AI` where a model name fits. Full lexicon: [BRAND.md § Lexicon](docs/BRAND.md#5-lexicon).
- When you edit a Markdown file, fix slop you pass in the same change. For code, use the `unslop` skill.

## Technologies

Exact versions live in each `package.json` and in `.nvmrc` — read them there.
Node 22.22.1 is the one pin stated in prose, because it is a hard constraint
(see [Prerequisites](#prerequisites)). Backend: Node, TypeScript, ES Modules,
Vitest. Web: React, Vite, MUI v7, Zustand, ReactFlow, TanStack Query, React
Router, Jest, Playwright. Electron: Electron, React, Vite. Mobile: React
Native / Expo ([mobile/README.md](mobile/README.md)).
