# NodeTool — Agent Rules

Visual AI workflow platform. TypeScript monorepo with React frontend, Electron
desktop app, and Node.js backend.

This file is the single source of truth for agents working in this repository:
architecture, commands, harnesses, and linter-like rules. `CLAUDE.md` is a macro
that points here — never put content there.

> _Last updated: 2026-08-17._ When the architecture, commands, or rules below
> drift from the codebase, update this file in the same PR.

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
- **[CLI](#cli)** — Full command and flag reference (see also [docs/cli.md](docs/cli.md))
- **[TypeScript Backend](packages/AGENTS.md)** — TypeScript backend packages (`packages/`)
- **[Agent System](packages/agents/AGENTS.md)** — Planning, execution, parallelism, skills, tuning
- **[Agent Architecture & Tools](docs/AGENTS.md)** — Agent architecture, tools, skills, workflow nodes
- **[JavaScript Sandbox](docs/javascript-sandbox.md)** — The QuickJS guest: capabilities, limits, imports, security model, and how the Code node and CodeAct use it
- **[Web UI](web/src/AGENTS.md)** — React web application
  - [Components](web/src/components/AGENTS.md), [Stores](web/src/stores/AGENTS.md), [Contexts](web/src/contexts/AGENTS.md), [Hooks](web/src/hooks/AGENTS.md), [Utils](web/src/utils/AGENTS.md), [ServerState](web/src/serverState/AGENTS.md), [Lib](web/src/lib/AGENTS.md), [Config](web/src/config/AGENTS.md)
- **[Testing](web/TESTING.md)** — Web testing guide (Jest, React Testing Library, Playwright)
- **[Electron](electron/src/AGENTS.md)** — Desktop app
- **[Mobile](mobile/AGENTS.md)** — React Native / Expo app
- **[Scripts](scripts/AGENTS.md)** — Build and release scripts
- **[URL Egress Inventory](docs/url-egress-inventory.md)** — Every surface that fetches a caller-provided URL, the one address table, and the SSRF policy each surface applies
- **[Writing Style](docs/WRITING_STYLE.md)** — Anti-slop prose rules and the forbidden-expressions list for all docs and Markdown

---

## Architecture

```
packages/           # 57 npm workspace packages (TypeScript backend)
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
  base-nodes/       # Core workflow nodes (text, image, LLM, agents)
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
- **UI Primitives (MANDATORY)**: All frontend UI must use primitives from `web/src/components/ui_primitives/`. **Never import raw MUI components** (`Typography`, `Button`, `IconButton`, `Tooltip`, `CircularProgress`, `Chip`, `Dialog`, `Alert`, `Divider`, `Paper`, etc.) outside of `ui_primitives/` or `editor_ui/`. See the **[Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md)** for the decision tree, migration rules, and full catalog of 90+ primitives. When touching any file, migrate raw MUI usage to primitives.
- **Media rendering (MANDATORY)**: `asset://<id>` is a stored identifier, not a URL — the bytes live under `<user_id>/<asset_id>.<ext>` and, on the cloud backends, behind a signed URL only the server can mint. Never set `src`/`poster` from a locator. Render stored media through `ResponsiveImage`, `VideoPlayer`, or `AudioPlayback` with a `locator` prop; those primitives resolve it. Their `src` prop takes a `ResolvedMediaUrl`, minted only by `utils/resolveMediaUri.ts` and `hooks/useResolvedMediaUri.ts`, so a raw string does not typecheck. The lint rule `design-tokens/no-unresolved-media-src` rejects a locator literal in a JSX url attribute; the rendering surfaces are inventoried in `web/src/__tests__/mediaResolutionBoundary.test.ts`.
- **Design tokens (MANDATORY)**: See **[docs/DESIGN.md](docs/DESIGN.md)** for the token systems — `SPACING` (4px grid), `TYPOGRAPHY` (4-size scale), `BORDER_RADIUS`, `MOTION`, `Z_INDEX`. **Never** hardcode border radii (`4`, `10`, `18px`), transition strings (`"all 200ms ease"`), font sizes (`"14px"`, `"0.85rem"`), or off-grid spacing (`5px`, `10px`, `13px`). Use the named constants from `ui_primitives`. When touching any UI file, fix violations in the same PR.
- **Styling**: MUI v7 + `sx` prop for one-off, `styled()` for reusable. Theme values only, no hardcoded colors/spacing. Prefer `FlexRow`/`FlexColumn` over `Box sx={{ display: "flex" }}` when the shorthand props (`gap`, `align`, `justify`) reduce verbosity; use `Box` directly when you have significant additional `sx` overrides anyway.
- **Node graph**: ReactFlow 12. Nodes extend `BaseNode` from `@nodetool-ai/node-sdk`.
- **Workspace access goes through an interface, never a path**: a run's files live behind `context.workspace` (`Workspace` in `@nodetool-ai/runtime`) — `read`/`write`/`list`/`stat`/`copy`/`move`/`delete` over workspace-relative paths. A local install backs it with a folder, a cloud deployment with a key prefix in the asset bucket (`NODETOOL_WORKSPACE_STORAGE`), and no caller branches on which. `workspace.localDir` is null on a virtual workspace and is only for code that genuinely needs a real directory: a host binary stages through `materialize`/`absorb` + `scratchDir`, and the two nodes that hold a live file (`lib.sqlite`, the tmux Claude-Code node) say they need a local workspace instead of silently losing writes. `context.workspaceDir` survives as the derived local path and is deprecated.
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

### Install in sandboxed / proxied environments

Three postinstall steps break `npm install` in locked-down containers (CI
sandboxes, Claude Code on the web, proxied networks). A failed postinstall
makes npm roll back the **entire** `node_modules` tree, so one bad package
means no dependencies at all — including ESLint and the design-lint gate.

1. **`keytar` needs libsecret headers on Linux.** Without them node-gyp fails
   with `Package libsecret-1 was not found`. Fix first:
   `apt-get install -y libsecret-1-dev`.
2. **`electron` downloads its binary in postinstall.** Proxies that block the
   download (HTTP 403) fail the install. Skip it when you don't need to launch
   Electron: `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install`.
3. **`onnxruntime-node` downloads CUDA binaries from GitHub releases** in
   postinstall (it assumes CUDA when `nvcc` is absent). Same proxy failure
   mode, and there is no skip env var in our pinned version.

When only the JS toolchain matters (typecheck, lint, unit tests that don't hit
native modules), bypass all of the above in one step:

```bash
npm install --ignore-scripts --no-audit --no-fund
```

This skips every postinstall — including the root `better-sqlite3` rebuild —
so anything touching the database needs `npm run rebuild:native` afterwards
(which will still require the downloads above to have succeeded).

### WebGPU on a headless machine

The image nodes are shader-backed: every `lib.image.*` generator and every
`nodetool.image` transform reaches WebGPU through Dawn. On a machine with no
Vulkan driver they fail with:

```
No WebGPU adapter available (Node/Dawn). On headless Linux this usually means
no Vulkan driver (ICD) is installed — Dawn has no software fallback of its own.
```

**This is an environment gap, not a broken test and not an unsupported
platform.** CI already solves it: the `test-packages` leg of
`.github/workflows/quality-checks.yml` and the browser job in `test.yml` both
install `mesa-vulkan-drivers`, which ships **lavapipe** — a CPU Vulkan ICD. Do
not conclude from this error that shader-backed nodes cannot be tested, and do
not skip a test because your box hits it; the same test passes in CI.

With root:

```bash
apt-get install -y mesa-vulkan-drivers
```

Without root (sandboxes, dev containers), extract the driver and point the
Vulkan loader at it. `libvulkan1` — the loader — is usually already present;
only the ICD is missing:

```bash
apt-get download mesa-vulkan-drivers
dpkg-deb -x mesa-vulkan-drivers_*.deb /tmp/vk
# The shipped manifest names the library relatively, so rewrite it absolutely:
python3 - <<'PY'
import json
p = "/tmp/vk/usr/share/vulkan/icd.d/lvp_icd.json"
d = json.load(open(p))
d["ICD"]["library_path"] = "/tmp/vk/usr/lib/x86_64-linux-gnu/libvulkan_lvp.so"
json.dump(d, open("/tmp/vk/lvp_icd.json", "w"))
PY
export VK_DRIVER_FILES=/tmp/vk/lvp_icd.json
```

Then run the tests as usual. Lavapipe is a software rasterizer, so it is slow
but exact — pixel comparisons (`nodetool.compare.CompareImages`) are
reproducible under it, which is what
`packages/base-nodes/tests/image-examples-run.test.ts` relies on.

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
(`tools/oxlint/anti-slop/`) runs through two configs, and every rule sits in
exactly one of them:

- `.oxlintrc.anti-slop.json` — the **backlog**, 16,975 findings. Run it with
  `npm run lint:anti-slop`. Not on the CI path; it would be red for months.
- `.oxlintrc.anti-slop-enforced.json` — everything already at **zero**. Run
  inside `npm run lint`, so it cannot come back.

The unit of enforcement is a **(rule, tree) pair**, not a rule. Nine rules over
60 trees is 540 pairs, and 262 of them are already at zero — so a rule still
over a thousand findings deep across the repo is nonetheless finished in
fifty-seven packages, and those fifty-seven are ratcheted today rather than
after the last one lands. Seven rules are at zero everywhere and sit in the
enforced config's top-level `rules`; the rest are enforced per-path, one
override block per rule listing the trees at zero for it.

`.github/workflows/anti-slop-ratchet.yaml` runs this loop daily: measure, fix
one tree, regenerate the overrides, and induce a failure to prove the new ones
bite. It opens a PR; it merges nothing.

Those override blocks are generated, never hand-edited:
`npm run lint:anti-slop:count` prints the table below, `:targets` adds the
trees closest to zero and the cheapest remaining pairs, `:write` regenerates
the overrides from a fresh measurement, and `:check` fails when the config and
the measurement disagree. Read the counts off `:targets` rather than off a raw
`oxlint` run — oxlint's own default rules report through the same channel, so
counting diagnostics instead of `anti-slop(...)` codes overstates a tree by
several times. Hand-maintaining them is how the numbers here drifted
before (6,991/18,453 recorded against an actual 7,016/18,504). The generator
lints one tree per oxlint invocation and rejects any tree whose scan touched
zero files: oxlint does not expand `packages/*/src` itself, and a glob that
reaches it unexpanded lints nothing while reporting nothing — which is
indistinguishable from a clean tree, and would ratchet all 540 pairs on a
broken run.

A rule that does not fit NodeTool is deleted from the plugin
instead — upstream ships it to be vendored and edited. That is why
`no-shape-in-symbol-names` is gone: it banned the substring "shape" in every
identifier, and here that is the sketch editor's drawing tools, tensor shapes,
and third-party contracts. Enforcement goes through the enforced config, not `.oxlintrc.json`,
because `web/`, `electron/` and `mobile/` carry their own `.oxlintrc.json` and
oxlint resolves the nearest config per file — a rule added at the root silently
skips those trees. `no-runtime-typeof` runs with `allowInTypeGuards: true`: a `typeof` directly
inside a function returning `v is T` is the rule's sanctioned form, so working
the backlog means consolidating repeated inline checks into named predicates
(each tree has a predicate module: `packages/protocol/src/predicates.ts`,
`web/src/utils/typePredicates.ts`, mobile's twin, per-package siblings), never
deleting guards. It is enforced for the twenty-three trees at zero on it (read
the list off the enforced config), with the decoder
`packages/protocol/src/typecheck.ts`
exempt: in the package that owns the schemas, an inline `typeof` means someone
bypassed the parse. One tradeoff: predicates take `value: unknown`, so
consolidation moves findings into `no-unknown-parameters`, which is why that
count rose while this one fell.

Two shapes the rule does **not** flag, because no predicate can replace them.
A `typeof` whose operand resolves to no variable in scope is a global-existence
probe — reading the bare name throws `ReferenceError`, so passing it to a
predicate is a crash, not a refactor. A `typeof` interpolated into a template
literal or returned is a value, not a narrowing. Both stop exactly there: an
operand that *does* resolve still reports, and `const kind = typeof value`
still reports, because narrowing laundered through a local is still narrowing.
`tools/oxlint/anti-slop/tests/` pins all of it.

Remaining backlog, largest first — regenerate with `npm run lint:anti-slop:count`:

| rule | findings | trees at zero |
|---|---:|---:|
| `require-safety-comment-for-type-assertion` | 7126 | 13 / 60 |
| `no-unsafe-dictionary-type` | 4377 | 13 / 60 |
| `no-unknown-parameters` | 1967 | 16 / 60 |
| `no-module-mocking` | 1492 | 57 / 60 |
| `no-known-value-widening` | 774 | 19 / 60 |
| `no-runtime-typeof` | 582 | 23 / 60 |
| `no-implicit-return-type` | 449 | 32 / 60 |
| `no-unknown-returns` | 253 | 42 / 60 |
| `no-chained-type-assertions` | 56 | 47 / 60 |

The two columns rank differently, and that is the scheduling signal.
`no-module-mocking` is 1,492 findings but zero in 57 of 60 trees: it is
concentrated in the frontend test suites and is a test-seam problem, not a
typing one — enforced everywhere else already, and worth its own change rather
than a slot in the typing work. `require-safety-comment-for-type-assertion` is
the opposite, present nearly everywhere, and moves only when the values crossing
a boundary get named. Twelve trees are at zero on all nine rules:
`packages/auth`, `packages/base-nodes`, `packages/chat`, `packages/config`,
`packages/document-nodes`, `packages/kie-codegen`, `packages/model-pricing`,
`packages/nodes-utils`, `packages/reve-nodes`, `packages/sdk`,
`packages/security`, `packages/workflow-runner`.

`no-hand-written-any` is the newest, and it exists because
`.github/workflows/type-safety.yaml` had no way to keep what it won: it greps
`web/`, `electron/` and `mobile/` nightly, fixes five to ten files, and nothing
stopped the next PR putting `any` back in the file it just cleaned.

What decided the rule's shape was counting first. Of the 1,012 `: any`
annotations in `packages/*/src`, **960** are `declare <name>: any` — the ambient
class field the `@prop` decorator requires for a node property, a deliberate
contract in `@nodetool-ai/node-sdk` and not fixable at the site. Reporting it
would have put the rule 960 findings deep on day one with nothing to do about
them, which is where `no-shape-in-symbol-names` was when it was deleted. So the
rule skips a `PropertyDefinition` with `declare: true` — decided from the AST,
not a name or a path — and what was left was 302 hand-written annotations.

Those 302 are now zero, so the rule sits in the enforced config's top-level
`rules` rather than in the backlog table above. **All 246 in `web/`,
`electron/` and `mobile/` were in test files** — the doubles, not the code under
test — which is why the nightly workflow kept finding more: it was cleaning
scaffolding, and scaffolding is where the next PR writes `any` again. Typing
them is what `web/src/test-utils/doubles.ts` is for, and it grew two helpers
in the sweep: `selectorOver(state)` types a mocked zustand selector from the
members a test supplies, and `mustFind(items, match)` reads what a test expects
to be there instead of dereferencing `Array.find`'s `T | undefined`. Ten such
dereferences were hiding behind the `any`-typed callbacks that mask them.

The remaining 56 were production code, and three of them were load-bearing.
`packages/models` annotated every `db.transaction` callback `any` because the
connection is typed as the SQLite driver while the Postgres branch calls
`.for("update")`; that is now `DbTransaction` plus a `forUpdate()` helper that
names the one capability the dialects do not share, and throws rather than
silently returning an unlocked query. `packages/vectorstore` sorted embeddings
by an `index` field its own declared response type omitted. `DBModel`'s
`[key: string]: any` — which made every property read on every model `any` — is
`unknown`, at the cost of one narrowing in `partitionValue()`.

It reports `any` in annotation positions: parameters, returns, variables,
properties, and type arguments (`any[]`, `Promise<any>`, `Map<string, any>`). It
deliberately does not report `as any` — `require-safety-comment-for-type-assertion`
asks whether an assertion is justified in writing, this one asks whether a type
can be written at all, and a third report on the same syntax buys nothing — nor a
type-alias body or a type-parameter default, neither of which is an annotation.
`Record<string, any>` is one finding, not two: an `any` under a type
`no-unsafe-dictionary-type` classifies belongs to that rule. The boundary is
exact and pinned by test — `Record<string, any[]>` has an array value type, so
the dictionary rule classifies nothing and the `any` is this rule's to report.

`.github/workflows/type-safety.yaml` is **gone**, folded into the ratchet. It
was a second nightly agent over `web/`, `electron/` and `mobile/`, and by the
time `no-hand-written-any` reached zero it had nothing of its own left. Its
`: any` scan was not merely redundant but unable to report zero: a grep for
`: any` in `web/src` matches twenty lines, every one of them prose or an
identifier named `anyType`, so the gate was pinned open on a signal no agent
could clear. Its `as any` half is `require-safety-comment-for-type-assertion` ×
{`web`, `electron`, `mobile`} — three pairs the ratchet already measures, and
holds once won, which the deleted workflow never did.

That left one thing the ratchet could not express, so it became a rule.
**`no-implicit-return-type`** reports an inferred return type on a module's
public surface: an exported function, an exported `const` bound to one, and the
non-`private` members of an exported class. Inference inside a module is fine —
the compiler reads the body. Across the boundary it means the contract is
whatever today's implementation happens to produce. `no-unknown-returns` reports
a return typed `unknown`; this one reports a return typed nothing, and the two
do not overlap: annotating `unknown` to silence this rule just moves the finding
to that one.

Counting first kept it shippable: scoped to exports it is **448 findings, at
zero in 29 of 58 trees** on the day it landed — the same order as
`no-runtime-typeof`, not the 6,990 that would have arrived from reporting every
arrow callback in the repo. Two boundaries are deliberate and pinned by test.
The rule walks *down* from the export declaration, so `const f = () => {}`
followed by `export { f }` is out of reach — reaching it needs binding
resolution the rule does not do. And a contract written on the binding
(`export const load: (a: string) => Promise<string> = …`) is an answer, not a
finding, which is also how a typed React component is usually written.

Deleting a workflow removed the only thing that ever worked the app trees, so
`:targets` grew a **largest (rule, tree) pairs** table and the ratchet takes
from it on every fourth run. The two tables it printed before — trees closest to
zero, and the forty cheapest pairs — are both selections for *small* work, so
`web` at thousands of findings appeared in neither. It was invisible to the
agent, which is the mechanical reason it needed a workflow of its own. A large
pair does not finish in one PR and only ratchets when it reaches zero; the
prompt says to bound it to one directory and report the before/after count
rather than imply the win is already held.

A rule can also stall short of zero. `no-unknown-returns` went 604 → 232 (the
predicate consolidation above put twenty back); what
is left is one thing said many ways — a node output, an app-state slot, a
stream item — for which NodeTool has no named type, plus the `Tool.process`
contract that erases every tool's result to share one registry. Those sites
carry a `HOLDOUT (anti-slop/no-unknown-returns)` comment saying so. Naming that
value domain is a modelling change, not an annotation, and until someone makes
it the rule stays in the backlog.

See [tools/oxlint/anti-slop/README.md](tools/oxlint/anti-slop/README.md).

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
npm run lint             # oxlint
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
npm run lint             # oxlint
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

### Code Review for Regressions

Before submitting a PR, review for:

1. **Existing tests still pass** and cover the changes
2. **No new TypeScript errors or lint warnings**
3. **No unintended side effects** in related code
4. **Edge cases and error handling** are covered
5. **Performance implications** considered

## Common Pitfalls

- **Node.js 22.22.1 is required**. This matches Electron 39's embedded Node (`process.versions.node === "22.22.1"`). Pinning the major keeps API parity between dev and the packaged app. The backend (dev and prod) runs on vanilla Node, not Electron's embedded Node, so the one source-built native module — `better-sqlite3` — is rebuilt against **Node** headers by the root `postinstall` (`electron/scripts/rebuild-native.mjs`). N-API modules (`bufferutil`, `sharp`, `keytar`, `sqlite-vec`) are ABI-stable, ship their own prebuilds via their normal install scripts, and are not rebuilt here.
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
- **`npm install` fails in sandboxed/proxied environments** (CI sandboxes, Claude Code on the web): `keytar` needs `apt-get install -y libsecret-1-dev` first; `electron` and `onnxruntime-node` download binaries in postinstall, which proxies can 403 (`ELECTRON_SKIP_BINARY_DOWNLOAD=1` covers Electron; onnxruntime has no skip var). Any postinstall failure rolls back the whole `node_modules` tree. For lint/typecheck-only work, `npm install --ignore-scripts` sidesteps all of it. Details: [§ Install in sandboxed / proxied environments](#install-in-sandboxed--proxied-environments).
- **"No WebGPU adapter available (Node/Dawn)" is a missing driver, not a broken test.** The image nodes (`lib.image.*` generators, every `nodetool.image` transform) reach WebGPU through Dawn, which has no software fallback of its own. CI installs `mesa-vulkan-drivers` — lavapipe, a CPU Vulkan ICD — on the `test-packages` leg of `quality-checks.yml` and the browser job in `test.yml`, so these tests pass there. Do not conclude that shader-backed nodes are untestable headlessly, and do not skip a test over it. With root: `apt-get install -y mesa-vulkan-drivers`. Without root: extract the deb and point `VK_DRIVER_FILES` at the `lvp_icd.json` inside it. Details: [§ WebGPU on a headless machine](#webgpu-on-a-headless-machine).
- **Native module install is a single command**: a clean checkout builds with `npm ci` (or `npm install`) alone — no manual follow-up. The native `better-sqlite3` rebuild runs from the **root** `postinstall` (`electron/scripts/rebuild-native.mjs`), which fires *after* npm has fully reified the tree. It deliberately does **not** run from the electron workspace's own postinstall: that fired mid-reify and raced npm's atomic renames of node-gyp's deps (`tinyglobby`), giving intermittent `Cannot find module 'tinyglobby'` failures. If you ever hit a `NODE_MODULE_VERSION` mismatch, force a rebuild with `npm run rebuild:native` (root) or `npm --prefix electron run rebuild:native`.
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
reference is the [CLI](#cli) section below, plus [docs/cli.md](docs/cli.md).

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
| Check that every agent capability names a check | `nodetool harness capabilities`; `npm run capabilities:check` | — | seconds |
| Check a provider's live response against the decoder that reads it | `npm run probe:providers` (nightly; offline half runs on every provider diff) | — | seconds |
| Author/inspect a graph against the live registry | — | `create_workflow`, `search_nodes`, `list_nodes`, `get_node_info`, `get_example_workflow`, `export_workflow_digraph` | — |
| Check a script↔storyboard link (extract, scaffold, joint assemble) | no command of its own — the pure-function suites the `script-storyboard-link` harness entry names, run by `harness gate` on diffs touching either surface | `get_storyboard`, `get_script` (link state, drift, orphans), `validate_timeline` on the assembled output | seconds |
| Build or fix a 3D scene with no editor open | no command of its own — the `capability-suites` selfcheck the `model3d` harness entry names | `list_model3ds`, `create_model3d`, `get_model3d`, `edit_model3d`, `validate_model3d` | sub-second |
| Season a prompt with the entity library | no command of its own — the `capability-suites` selfcheck the `entities` harness entry names | `list_entities`, `get_entity`, `apply_entities` | sub-second |
| Jobs & assets | `nodetool jobs …` / `nodetool assets …` | `list_jobs`, `get_job`, `get_job_logs`, `list_assets`, `get_asset` | — |
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

### nodetool chat

Every chat session runs the unified agent loop. There is no mode to select:
`-a, --agent` and `--no-agent` are accepted for backwards compatibility and do
nothing (`packages/cli/src/index.ts` marks both `[deprecated] No-op`).

```bash
# Interactive chat
npm run dev:chat -- --provider openai --model gpt-5.4-mini
npm run dev:chat -- --provider anthropic --model claude-sonnet-5

# Piped input (non-interactive)
echo "research 5 AI topics" | npm run dev:chat -- --provider openai --model gpt-5.4-mini

# Connect to running WebSocket server
npm run dev:chat -- --url ws://localhost:7777/ws
```

Chat flags:
```
-p, --provider <name>    anthropic, openai, gemini, xai, groq, mistral, deepseek,
                         moonshot, minimax, cerebras, meta, alibaba, together,
                         openrouter, huggingface, replicate, kie, aki, ollama,
                         lmstudio, claude_agent_sdk, codex, gmi, mlx, node_llama_cpp
                         (any registry provider id also works, e.g. vllm, llama_cpp)
-m, --model <id>         Model ID (e.g. claude-sonnet-5, gpt-5.4-mini)
-w, --workspace <path>   Workspace directory for file tools
--tools <list>           Comma-separated tool names
-u, --url <ws-url>       Connect to WebSocket server instead of local provider
--no-read-only-search    Disable the read-only run_search fan-out primitive
                         (on by default)
-a, --agent [mode]       [deprecated] No-op
--no-agent               [deprecated] No-op
```

Interactive commands: `/help`, `/new`, `/clear`, `/compact [instructions]`, `/model <id>`, `/provider <name>`, `/tools`, `/exit`, `/quit`

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
(Claude Code, Codex) use `nodetool mcp install` instead. To reach a *deployed*
server rather than a local one, the client points at `/mcp` with a token minted
in **Settings → MCP → Connect an agent remotely** — see
[docs/mcp-production.md](docs/mcp-production.md).

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
(`packages/execution/src/service/debug-sessions.ts`). Escalations the agent leaves
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

### Marketing chat screenshots

The chat panel on the marketing site is shot the same way — from the real UI,
not mocked up. `npm run chat-shots` (in `web/`) builds the stills the casts
embed, then replays each cast in `web/src/demo/chat/marketing/` through
`web/demo.html?chat=<id>&t=<ms>&bare=1` and writes
`marketing/public/chat/<id>.webp` plus the size manifest the gallery's
`next/image` needs (`marketing/src/data/chatShots.generated.ts`).

The casts are authored rather than recorded, and the run blocks tRPC, so a
re-run reproduces the same frames on any machine with no backend, no model
call, and no credits spent. Changing the prose in a cast changes how the
answer wraps, so re-run the script rather than editing a `.webp`: the height
of each shot is measured from the rendered thread, not declared.

The storyboard surface loop replays the same SCRAPHEART board through the real
`StoryboardBoard` (`web/src/demo/doc/storyboardAssistantCast.ts`), with its
keyframes inlined by `web/scripts/build-storyboard-cast-stills.mjs`. Six cards
are taller than a 1080-line frame, so the loop scrolls the surface as the
stills land (`panPx` in `demo/src/hero/SurfaceLoop.tsx`) rather than cropping
the last shot. Re-render with `npm run render:surfaces` in `demo/`, then
encode `marketing/public/surface-storyboard.{mp4,webm}` and its
`-poster.webp`.

### nodetool app build (Mini-App Build Harness)

Turns a prompt — or a hand-written `spec.json` — into a verified
`ApplicationBundle`, without touching the database. Six stages run in order:
**spec** pins what the app must do, **plan** builds one workflow per operation
with `authorGraph` (or binds one you pin), **author** drives the real `ui_app_*`
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

#### On the server: `POST /api/applications/build`

The same `buildApp` runs on the server:
`POST /api/applications/build {prompt | spec, provider, model, workflow_ids,
max_repairs, cost_cap_usd, timeout_ms}` returns the `BuildReport`. Provider and
model come from the body, and the server falls back to
`NODETOOL_APP_BUILD_PROVIDER` / `NODETOOL_APP_BUILD_MODEL`. The cost cap
defaults to the harness's own $2.

**There is no `build_app` agent tool.** An agent builds an app the way a person
does — declare the operations, place the widgets, and grade every change with
`debug_app` / `ui_app_debug` — instead of handing the job to a second agent it
cannot see into. The route stays for the CLI, the eval suite, and a caller that
wants the batch build.

Off the browser that path runs through **`create_app`** and **`edit_app`**.
`edit_app` takes `[{tool, input}, …]` naming the same `ui_app_*` tools the Puck
editor exposes, replays them against the saved document through
`app-build/bridge.ts` — the headless twin the Author stage and the `app-tools`
eval already drive — and saves once, CAS on `updated_at`. Call it with no steps
to get the tool catalog and the app's current state. The tools themselves stay
in one implementation, so the browser and the headless path cannot drift.

A build runs for minutes, so `poll: true` returns a session id immediately and
the caller reads `GET /api/debug/sessions/:id` until it settles, or cancels with
`POST /api/debug/sessions/:id/cancel` — the same session machinery an
interactive `debug_workflow` run uses (`packages/execution/src/service/debug-sessions.ts`).
A cancelled build settles as `failed` with `reason: "cancelled"`.

The bundle behind a green verdict is offered, never installed: it becomes an
application through the normal `POST /api/applications/import-bundle`. Server
code: `packages/agents/src/app-build/build-service.ts`.

### nodetool validate (Static Workflow Check)

Checks a workflow against the node registry **without running it** — unknown
node types, missing required properties, unselected models, model properties
naming an unregistered provider or a model id that provider does not offer,
dangling and mis-typed edges, dynamic slots typed with a
JSON-Schema/TypeScript name instead of NodeTool's (`integer` → `int`), and Code
node bodies. On a DB-id target, where the store is reachable, it also warns
about declared credentials (`required_settings`, a Code node's `secrets`) this
install cannot resolve. Returns in well under a second, so it's the cheap
pre-flight before an expensive `debug` run. Accepts a workflow id, JSON file,
or DSL `.ts` file. File/DSL targets need no database.

Model references are found wherever they sit — a top-level property, an entry
in a `list[…_model]`, one nested in a settings object, or a dynamic slot value.
Both catalogs fail toward silence: an empty provider list means the registry
could not be reached, and a catalog only enumerable over the network (Anthropic,
Ollama, ASR ids anywhere) reports nothing rather than calling a real id a typo.
The check runs at graph *creation* time too — `validate_workflow` sits on the
authoring agent's belt, `create_workflow` refuses to save a graph whose
provider or model the model hallucinated — and
`POST /api/workflows/:id/run|debug` refuses the run with a
400 before the job row exists, instead of failing on the model node after the
upstream half of the graph has been paid for. The same refusal covers
credentials: a run whose selected providers have no resolvable key (secret
store, then env) is refused with 400 naming each missing secret.

A `nodetool.code.Code` node's `code` is parsed, not just stored: a body that is
not valid JavaScript, uses `export` at the top level, imports a specifier no
installed pack serves (a node declares no packages — its imports are the
declaration, resolved against the catalog),
reads a bare name that is not a sandbox API — including one of the node's own
inputs, which arrive on the `inputs` object, so a bare read is a ReferenceError
too — never returns, or leaves a declared output unset on some return path is
reported against the node. A named `inputs.<name>` read or `stream("name")` /
`emit("name")` call is not an error: the validator, the editor and the graph
tools all count it as a declared handle.
The analysis lives in `@nodetool-ai/node-sdk` (`code-analysis.ts`,
`code-node-validation.ts`), so the graph validator, the `submit_code` planner
and the editor read one AST.

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

The credential warning reaches that tool too, on a graph as well as a saved
workflow. The run answers which of the declared names this install holds
(`CapabilityRun.availableSecrets`, built from the context by
`contextSecretAvailability`), and the issue tells the agent where a person sets
one — plus `request_secret` where the run can raise that dialog, and never on a
headless run, where the call fails closed. A run with no reachable store
carries no callback and the check is skipped: nothing could answer, and
reporting every declared key as absent would warn on every graph. The hosts
that inject are audited by
`packages/agents/tests/capability-run-secrets-audit.test.ts`, which records the
runs that deliberately omit it and how many calls each is allowed.

### nodetool timeline validate / debug (Timeline Harness)

Checks a timeline sequence without rendering it, and replays a scripted edit
session against it. The target is a timeline JSON file — a bare
`TimelineDocument` or anything carrying one under `document`, so a
`timeline.get` tRPC response works as-is — or a `timeline_sequences` row
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

The same static check is exposed to agents through the **`validate_timeline`**
tool: pass an inline `document` to check a timeline being built, or a
`timeline_id` to validate a saved sequence (scoped to the requesting user). The
timeline assistant is told to call it after edits, before the user renders.

The bundle (`nodetool-debug/timeline-<id>-<ts>/`) holds `report.json`,
`report.md`, and `timeline.json` (the input document). Exit code 0 only when
the verdict is ok. Validation and report rules live in
`@nodetool-ai/execution/timeline-debug`; the CLI keeps target resolution, the
interaction script, and the bundle.

### nodetool timeline versions (Timeline Version History)

`timeline versions` reads and writes a sequence's snapshot history against the
local database — manual saves, the autosaves `timeline.update` writes at most
every five minutes, and the pre-restore snapshot that makes a restore undoable.
All five subcommands take `--json`.

```bash
npm run dev:nodetool -- timeline versions list <timeline_id> --save-type manual --limit 10
npm run dev:nodetool -- timeline versions show <timeline_id> 3 --json
npm run dev:nodetool -- timeline versions create <timeline_id> --name "before the recut"
npm run dev:nodetool -- timeline versions restore <timeline_id> 3
npm run dev:nodetool -- timeline versions delete <timeline_id> 3 --yes
```

`restore` mirrors the tRPC router: it snapshots the current state as a
`restore` version, CAS-writes the old document and its render settings back
onto the sequence, then runs the same static check `timeline validate` runs. An
old document is restored against today's schema, so what it used to pass is not
what it passes now — a restore whose document no longer validates exits
non-zero and prints the issues.

Agents get the same history headlessly: **`list_timelines`**,
**`list_timeline_versions`**, **`get_timeline_version`** (read one snapshot's
document without restoring), **`create_timeline_version`** (manual snapshot),
**`delete_timeline_version`**, and **`restore_timeline_version`**, which
snapshots the pre-restore state first and returns the post-restore validation.
None of them needs an open editor or a running server.

### nodetool sketch validate / debug (Sketch Harness)

Checks a sketch (image document) without opening an editor, and replays a
scripted edit session against it. The target is an image document JSON file — a
bare `{sketch, layerBindings}` object or anything carrying one, so a
`sketch.get` response or an `image_documents` row works as-is — or an
`image_documents` row id. A path that exists on disk wins over an id.

```bash
npm run dev:nodetool -- sketch validate <image_document_id>
npm run dev:nodetool -- sketch validate sketch.json --json
npm run dev:nodetool -- sketch validate <id> --warnings-as-errors

npm run dev:nodetool -- sketch debug sketch.json \
  --interact '[{"tool":"add_layer","input":{"name":"Shadow"}},
               {"tool":"set_layer_props","input":{"target":"Shadow","opacity":0.4,"blendMode":"multiply"}}]'
npm run dev:nodetool -- sketch debug <id> --out ./mydebug --json
```

`validate` reads what a headless check can decide: a duplicate layer id, an
`activeLayerId` or binding pointing at a layer the document lacks, opacity or a
blend mode no compositor ships, a binding with no workflow or prompt behind it,
and fields a schema round trip would strip. `debug` runs the same check, then
executes each `--interact` step against the headless `ui_sketch_*` bridge — the
one the `sketch-tools` eval drives — and validates the document the session
left behind. A failing step is recorded and the script continues. Pixels,
painting, rendering, generation, and asset I/O are not simulated; the report
lists that under `notSimulated`. Layer bitmaps stay opaque throughout.

The same static check is exposed to agents through the **`validate_sketch`**
tool: pass an inline `document` to check a sketch being built, or an
`image_document_id` to validate a saved one (scoped to the requesting user).
Agents also get the version history headlessly: **`list_sketches`**,
**`create_sketch`** (a blank canvas, then `edit_sketch`),
**`list_sketch_versions`**, **`get_sketch_version`** (read one snapshot's
document without restoring), **`create_sketch_version`** (manual snapshot),
**`delete_sketch_version`**, and **`restore_sketch_version`**, which snapshots
the pre-restore state first and returns the post-restore validation.

The bundle (`nodetool-debug/sketch-<id>-<ts>/`) holds `report.json`,
`report.md`, and `sketch.json` (the input document). Exit code 0 only when the
verdict is ok. Validation and report rules live in
`@nodetool-ai/execution/sketch-debug`; the CLI keeps target resolution, the
interaction script, and the bundle.

### nodetool sketch versions (Sketch Version History)

`sketch versions` reads and writes an image document's snapshot history against
the local database — manual saves, the autosaves `sketch.update` writes at most
every five minutes, and the pre-restore snapshot that makes a restore undoable.
The per-layer generation takes (`sketch.versions.*` in the tRPC router) are a
different thing: those record one generated image on one layer, these snapshot
the whole document. All five subcommands take `--json`.

```bash
npm run dev:nodetool -- sketch versions list <image_document_id> --save-type manual --limit 10
npm run dev:nodetool -- sketch versions show <image_document_id> 3 --json
npm run dev:nodetool -- sketch versions create <image_document_id> --name "before the repaint"
npm run dev:nodetool -- sketch versions restore <image_document_id> 3
npm run dev:nodetool -- sketch versions delete <image_document_id> 3 --yes
```

`restore` mirrors the tRPC router (`sketch.documentVersions.restore`): it
snapshots the current state as a `restore` version, CAS-writes the old document
and its canvas settings back onto the image document, then runs the same static
check `sketch validate` runs. An old document is restored against today's
schema, so what it used to pass is not what it passes now — a restore whose
document no longer validates exits non-zero and prints the issues. Layer
bitmaps stay opaque to that check.

### nodetool jsscript (JS Script Harness)

A JS script is a named, versioned script document — a body plus declared ports,
secrets, a timeout, and saved test cases
([docs/js-script-document-design.md](docs/js-script-document-design.md)). The
target of every command is a script JSON file (a bare `JsScriptDocument` or
anything carrying one under `document`) or a `js_scripts` row id. A path that
exists on disk wins over an id; file targets need no database.

```bash
npm run dev:nodetool -- jsscript validate <id|file.json> [--json] [--warnings-as-errors]
npm run dev:nodetool -- jsscript run <id|file.json> --inputs '{"numbers":[1,2,3]}'
npm run dev:nodetool -- jsscript run <id|file.json> --input-streams '{"numbers":[1,2,3]}'
npm run dev:nodetool -- jsscript test <id|file.json> --json
npm run dev:nodetool -- jsscript debug <id|file.json> \
  --interact '[{"tool":"set_code","input":{"code":"await output(\"n\", 1);"}}]'
npm run dev:nodetool -- jsscript versions list|show|create|restore|delete <id>
```

`validate` reads what a headless check can decide: the body's syntax, imports
against the installed catalog (a script has no packages setting), undefined names, undeclared `inputs.*` reads,
outputs no `emit`/`output` call reaches, duplicate or non-identifier port names,
and tests naming ports the script does not declare. A body that declares outputs
and returns them instead of emitting them is an **error** — a script has no
legacy return contract. Zero saved tests and a declared secret this install
lacks are warnings.

`run` executes the body once in the QuickJS sandbox. A body that reads its
inputs with `stream` is fed with `--input-streams '{handle: [item, …]}'` instead
of `--inputs`; a staged handle the script does not declare is refused. `test`
runs the document's own saved cases (which stage their own items in
`inputStreams`), grades them the way `test_code` grades a case list, and exits
non-zero on any failure — the keyless selfcheck the harness gate runs, against
`packages/cli/tests/fixtures/js-script-sum.json` and
`js-script-running-total.json`. `debug` replays each
`--interact` step against the headless `ui_jsscript_*` bridge (tool names with
or without the prefix; a failing step is recorded and the script continues),
validates the document the session left behind, and writes
`nodetool-debug/jsscript-<id>-<ts>/` with `report.json`, `report.md` and
`jsscript.json`. `versions restore` snapshots the pre-restore state first and
re-validates against today's schema, so a restore that no longer validates exits
non-zero. Not simulated: the editor, persistence of a debug session, and secret
values.

Agents reach the same surface through the `js-scripts` capability module —
**`list_js_scripts`** (id, name, description, ports: the discovery surface),
**`get_js_script`**, **`save_js_script`** (validated first, CAS on update),
**`validate_js_script`**, **`run_js_script`** and **`test_js_script`**. A script
runs inside its own envelope: every installed sandbox pack and every
`@nodetool-ai/sandbox-nodetool/<namespace>` module by import, its declared
secrets intersected with whatever allowance the invoking context carries, its
own timeout, and the same imported / `nodetool.*` belt a Code node has.
Composition is bounded like sub-agents: depth cap 4
and a script id chain, so a cycle fails the call naming it. Validation and
report rules live in `@nodetool-ai/execution/js-script-debug`; the CLI keeps
target resolution, the interaction script, and the bundle. Eval suite:
`nodetool eval jsscript-tools`.

### Script voicing tools (no workflow, no browser)

An agent voices a script and cuts it without authoring a workflow:
**`voice_script_lines`** synthesizes each line with its cast voice and saves the
take onto the line, and **`assemble_script_timeline`** lays the voiced takes end
to end into a saved timeline sequence — which `validate_timeline` then checks.
**`list_scripts`** and **`get_script`** find the script and report each line's
status (`draft`, `stale`, `voiced`, `no_voice`).

Voicing defaults to every line that is draft or stale, so one call covers a
script; a line uses its own voice unless the call overrides provider+model+voice
for all of them. Word timings come from a best-effort transcription pass and
ride into the assembled clips as captions. The voice, staleness, and script →
timeline rules live in `@nodetool-ai/timeline`
(`effectiveVoice`/`needsVoicing`/`buildScriptTimeline`), shared with the editor
and the `nodetool.script.*` nodes. Code:
`packages/agents/src/tools/script-voice-tools.ts`. The `ui_script_*` tools
remain the path when the script is open in a browser.

### Storyboard render tools (no workflow, no browser)

An agent takes a storyboard from directed to delivered without authoring a
workflow: **`create_storyboard`** makes a blank board (then `edit_storyboard`
adds shots), **`render_storyboard_stills`** calls the image model per shot and
saves each still as the shot's keyframe, **`render_storyboard_clips`** animates
those keyframes into clips, **`revise_storyboard_clip`** revises one take, and
**`assemble_storyboard_timeline`** lays the rendered clips into a saved timeline
sequence — which `validate_timeline` then checks. **`list_storyboards`** and
**`get_storyboard`** find the board and its shot ids.

Both render tools default to "every shot that still needs this step", so a whole
board is one call; provider and model come from the call or the board's own
selection, and an unset model is an error naming `find_model` rather than spend
on a model nobody chose. The prompts, entity seasoning, and shot → timeline
mapping are the editor's own (`entitiesForShot` in `@nodetool-ai/protocol`,
`buildStoryboardTimeline` in `@nodetool-ai/timeline`), so a headless render
matches one done in the UI. Code:
`packages/agents/src/tools/storyboard-render-tools.ts`. The `ui_storyboard_*`
tools remain the path when the board is open in a browser and the user should
watch it fill in.

### Shipped example storyboards

Boards ship the way workflows and apps do — a file on disk, read without a
user, installed into a library with one insert. The bundles are
`packages/base-nodes/nodetool/examples/storyboards/<slug>.storyboard.json`
(the `storyboards` sibling of the example workflows, which is where
`exampleStoryboardsDir` looks by default in the monorepo, the packaged
backend, and the server image). `storyboards.examples` lists them and
`storyboards.installExample` installs one; the web offers both under
**New → New storyboard…**.

What makes them worth shipping is that the shots arrive finished: action text,
a still, and a clip on every one. The media are `package://` assets under
`assets/nodetool-base/storyboards/<slug>/`, so one copy on disk serves every
user and an install writes no bytes.

`node scripts/build-example-storyboards.mjs` builds them from
`scripts/example-storyboards/boards.mjs`: it draws each shot's frame (layers
declared in the spec → SVG → sharp) and animates it into a clip with ffmpeg,
so the build needs no API key and produces the same frames every time. Add
`--check` for the CI shape (bundles unchanged, every named media file
present), `--board <slug>` for one, `--skip-media` for the JSON alone.
`npm run validate:examples` checks each shipped board's shot text and that
every still and clip it names is on disk, and
`scripts/verify-backend-bundle.mjs` checks the same files were staged into the
packaged bundle.

### 3D scene tools (no editor, no browser)

An agent builds and fixes a 3D model without an editor open:
**`list_model3ds`** finds the `.glb`/`.gltf` assets, **`create_model3d`** makes
one holding an empty glTF scene (optionally applying operations in the same
call), **`get_model3d`** lists every object with its transform, visibility and
material color plus the scene's world-space bounds, **`edit_model3d`** runs the
`ui_3d_*` verbs — add and delete primitives and lights, set transforms, rename,
show and hide, recolor, select — against the stored document and saves it back
over the same asset, and **`validate_model3d`** checks a document statically.

The operations, the units (Euler degrees, CSS hex) and the "uuid or name"
addressing live in `@nodetool-ai/model3d`, shared with the browser editor, so a
model built headlessly opens there unchanged and an edit touches only the nodes
it names — an imported model keeps its meshes, textures, skins and animations.
Object ids are stamped into `node.extras.nodetool_id`, because glTF addresses
nodes by array index and a delete renumbers them.

The camera has no headless equivalent: `ui_3d_frame_scene` and
`ui_3d_capture_view` need a WebGL context, and `get_model3d`'s bounds are what
answers "how big is this and where is it" without one. Implementations:
`packages/agents/src/capabilities/model3d.ts`. The `ui_3d_*` tools remain the
path when the model is open in a browser.

### Entity library tools (no browser)

The reusable production entities — characters, locations, styles, props — are
image assets carrying a marker under `metadata.nodetool_entity`.
**`list_entities`** lists them (filtered by kind or text), **`get_entity`**
reads one in full, and **`apply_entities`** pastes their descriptors into a
prompt and returns the reference-image asset ids to pass to an image model.

The injection rule is `injectEntities` in `@nodetool-ai/protocol`, shared with
the browser's `ui_entity_apply` and the Director node: with explicit
`entity_ids` exactly those apply, otherwise the entities whose name appears in
the text (all of them when the text is empty). An id that resolves to nothing
comes back in `missing_entity_ids` — otherwise the prompt returns unseasoned
and looks fine. Implementations:
`packages/agents/src/capabilities/entities.ts`.

### Code authoring tools (no workflow, no browser)

An agent writes, checks, and debugs a `nodetool.code.Code` body without
authoring a workflow: **`validate_code`** runs the same static check the
workflow validator runs (syntax, imports against the installed catalog,
undefined names, undeclared `inputs.*` reads, outputs unset on a return path),
**`run_code`** executes a body in the QuickJS sandbox with given inputs and
returns outputs, logs, and error (`yield` bodies return the collected
`streamed` items), and **`test_code`** grades a case list — inputs plus
expected outputs per case — as the regression check after an edit.

Execution matches the Code node: the body-shaping rules (implicit return,
`yield` collection, output normalization) live in `@nodetool-ai/node-sdk`
(`code-body.ts`), shared with `packages/code-nodes`, so a body that passes the
harness runs the same way inside a workflow. Harness runs are hermetic: no node
toolbelt, and only the secrets a call names in `secrets` are readable. These
are not a second CodeAct surface — `execute_code` remains how an agent acts;
this harness authors *node* code. Implementations:
`packages/agents/src/capabilities/code.ts`. In the editor, the Code node's
assistant dialog (code editor + chat side panel, `ui_code_*` tools) drives the
same loop while the user watches.

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

Runs the graph authoring eval suite (`authorGraph` over the typed DSL pack)
against any registered provider and reports metrics: success rate, expectation
score, one-shot rate (graphs delivered in the first authoring round), authoring
rounds (`execute_code` actions), tool calls, duration, and cost. Cases and
expectations live in `packages/agents/src/evals/`.

```bash
npm run dev:nodetool -- eval graph-planner --list                     # show cases
npm run dev:nodetool -- eval graph-planner -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- eval graph-planner -p ollama -m qwen-3.5:4b --cases summarize,branch-both-paths
npm run dev:nodetool -- eval graph-planner -p openai -m gpt-5.4-mini --json --out report.json
npm run dev:nodetool -- eval graph-planner -p anthropic -m ... --min-success 0.8   # non-zero exit below threshold
```

**No API key? Use the Claude Agent provider.** In keyless environments —
Claude Code on the web, CI sandboxes — the `claude_agent_sdk` provider runs
every eval suite on the session's own Claude credentials, no secret store
needed. In the web sandbox (uid=0) set `IS_SANDBOX=1` so the nested CLI
accepts the permission bypass:

```bash
IS_SANDBOX=1 npm run dev:nodetool -- eval graph-planner -p claude_agent_sdk -m claude-sonnet-5
```

Details on env stripping and the uid=0 blocker:
[docs/AGENTS.md § Claude Agent SDK](docs/AGENTS.md#claude-agent-sdk).

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

The task planner has a suite of its own, scoring the plan without running it:
**`task-planner`** (multi-task DAG quality — parallel width, decomposition
size, tool routing, no synthesis task).

```bash
npm run dev:nodetool -- eval task-planner -p anthropic -m claude-sonnet-5
```

A **`codeact`** suite scores the CodeAct execution mode (steps act by writing
sandboxed JavaScript over the toolbelt instead of JSON tool calls —
[docs/codeact-design.md](docs/codeact-design.md)) on offline instrumented
cases: required tools invoked, action rounds within bounds, result correct.

```bash
npm run dev:nodetool -- eval codeact -p anthropic -m claude-sonnet-5
```

A **`subtask`** suite scores delegation: each of its seven cases hands the
parent an objective it should hand to a `run_subtask` child, and the check is
that the *child* — not the parent — ran the inherited tools. The instrumented
tools record the subtask depth of every call, so "the parent did it itself"
scores differently from "the parent delegated". It also covers subtask count,
recursion depth, error propagation, and whether the delegated result reached
the parent's answer.

```bash
npm run dev:nodetool -- eval subtask --list
npm run dev:nodetool -- eval subtask -p anthropic -m claude-sonnet-5
```

Alongside `graph-planner` (graph authoring) there are eleven **tool-loop**
suites that drive a real provider through the frontend `ui_*` tool contract against a
headless bridge — no browser — and score the multi-turn tool-calling flow
structurally: `tool-loop` (graph editor), `workflow-escalation`, `script-tools`,
`jsscript-tools`, `sketch-tools`, `timeline-tools`, `storyboard-tools`,
`model3d-tools`, `app-tools`, `thread-memory-tools`, and `creative-pipeline`.
Same flags, metrics, and `--min-success` CI gate as `graph-planner`. Details:
[packages/agents/AGENTS.md](packages/agents/AGENTS.md).

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

### nodetool packs compile (Sandbox npm Modules)

A sandbox pack can declare a guest module by npm dependency name instead of
authoring code (`{"name": ".", "kind": "js", "npm": "js-yaml"}`). This builds
it: esbuild bundles the dependency with pinned resolver conditions and no
externals, a scope-aware scan rejects free references to globals the guest
lacks, and a capability-free QuickJS probe imports the bundle to prove it
initializes. Results are cached by content digest — never by version — under
`<user cache>/nodetool/sandbox-modules`.

```bash
npm run dev:nodetool -- packs compile                  # every installed pack
npm run dev:nodetool -- packs compile --json           # machine-readable report
npm run dev:nodetool -- packs compile --force          # recompile and re-probe
npm run dev:nodetool -- packs compile --pack-search-path <node_modules dir>
```

Everything that stops a module short of admission is a **named skip**, not an
error: `npm-module-builtin-import` (the dependency needs `node:*`),
`npm-module-unresolved`, `npm-module-too-large` (1 MB cap),
`npm-module-forbidden-global`, and `npm-module-probe-failed`. The skips reach
the Package Manager through `packs.sandboxModules` diagnostics.

The server compiles during its own catalog refresh and Electron compiles after
an install, so the command is for a warm cache and for diagnosing one pack. The
CLI's synchronous registry build never compiles: it reads the cache, re-hashing
every recorded input first, and a miss surfaces as `pending-compile` naming this
command. Compiler: `packages/sandbox-compiler`. Design:
[docs/sandbox-package-design.md](docs/sandbox-package-design.md) § Config-only
modules from npm packages.

**Every library the sandbox offers is an importable pack.** There is no library
global — the `data.*` namespace is gone. NodeTool ships thirty-eight packs in
`packages/sandbox-packs/`, each a package.json manifest plus a SKILL.md, and
every one of them is available out of the box:

| Pack | Library | Runs |
|---|---|---|
| `@nodetool-ai/sandbox-dates` | date-fns | guest |
| `@nodetool-ai/sandbox-yaml` | js-yaml | guest |
| `@nodetool-ai/sandbox-markdown` | marked | guest |
| `@nodetool-ai/sandbox-qr` | uqr | guest |
| `@nodetool-ai/sandbox-subtitle` | subtitle | host |
| `@nodetool-ai/sandbox-tokens` | js-tiktoken | host |
| `@nodetool-ai/sandbox-color` | culori | guest |
| `@nodetool-ai/sandbox-decimal` | decimal.js | guest |
| `@nodetool-ai/sandbox-expr` | expr-eval | host |
| `@nodetool-ai/sandbox-jmespath` | jmespath | guest |
| `@nodetool-ai/sandbox-chrono` | chrono-node | host |
| `@nodetool-ai/sandbox-exif` | exifr | host |
| `@nodetool-ai/sandbox-stats` | simple-statistics | guest |
| `@nodetool-ai/sandbox-rrule` | rrule | guest |
| `@nodetool-ai/sandbox-ics` | ics | host |
| `@nodetool-ai/sandbox-gif` | gifenc | guest |
| `@nodetool-ai/sandbox-csv` | papaparse | host |
| `@nodetool-ai/sandbox-html` | cheerio + turndown | host |
| `@nodetool-ai/sandbox-xml` | fast-xml-parser | host |
| `@nodetool-ai/sandbox-xlsx` | exceljs | host |
| `@nodetool-ai/sandbox-diff` | diff | host |
| `@nodetool-ai/sandbox-zip` | fflate | host |
| `@nodetool-ai/sandbox-ocr` | tesseract.js | host |
| `@nodetool-ai/sandbox-tfjs` | TensorFlow.js + model zoo | host |
| `@nodetool-ai/sandbox-docx` | docx | host |
| `@nodetool-ai/sandbox-mammoth` | mammoth | host |
| `@nodetool-ai/sandbox-epub` | epub2 | host |
| `@nodetool-ai/sandbox-fabric` | fabric | host |
| `@nodetool-ai/sandbox-pdflib` | pdf-lib | host |
| `@nodetool-ai/sandbox-pptxgen` | pptxgenjs | host |
| `@nodetool-ai/sandbox-pptx` | office-text-extractor | host |
| `@nodetool-ai/sandbox-pdf` | pdf-parse | host |
| `@nodetool-ai/sandbox-aws` | NodeTool's SigV4 signer | host |
| `@nodetool-ai/sandbox-notion` | NodeTool's Notion helper | host |
| `@nodetool-ai/sandbox-supabase` | NodeTool's PostgREST helper | host |
| `@nodetool-ai/sandbox-twilio` | NodeTool's Twilio helper | host |
| `@nodetool-ai/sandbox-dsl` | NodeTool's generated graph builder | guest |
| `@nodetool-ai/sandbox-flow` | NodeTool's generated node callables | guest |

**guest** means the compiler bundles the library into QuickJS. **host** means it
runs where the sandbox runs — needed when the library wants Node builtins or a
DOM, when it carries a limit the guest could not enforce on itself (zip's
50 MB inflation cap), or when the code is NodeTool's own and a config-only pack
therefore cannot ship it.

The last two are authored guest code rather than a library: `-dsl` builds a
workflow graph, `-flow` calls nodes as typed async functions
(docs/dsl-native-flow-design.md). Both are generated from `packages/dsl` and
rebuilt by `npm run build:sandbox-dsl` / `build:sandbox-flow`.

### Native flow: call nodes from sandboxed code

A third way to run nodes, next to `WorkflowRunner` and the graph DSL: guest
code in the QuickJS sandbox calls a node as a typed async function and writes
the control flow in plain JavaScript. `await` is the edge, a variable is the
wire, `Promise.all` is the fan-out — no graph, no edges, no runner.

```js
import "@nodetool-ai/sandbox-nodetool/flow";   // mounts the bridge (body-side, required)
import { concat } from "@nodetool-ai/sandbox-flow/nodetool.text";

const r = await concat({ a: inputs.left, b: inputs.right });
await output("joined", r.output);
```

One module per node namespace (68 namespaces, 424 nodes), generated by the
same `npm run codegen` pass as the graph DSL and shipped as the
`sandbox-flow` pack. Streaming-output nodes carry `.stream(inputs)` — an
async iterable over cursor calls; early `break` closes the stream and runs
node cleanup. Errors reject the call; `try`/`catch` is the supervisor.

Each call bridges to the host's registry/invoke path through the
`@nodetool-ai/sandbox-nodetool/flow` capability module (`invoke_node`,
`open_node_stream`/`take_node_stream`/`close_node_stream`), so every
invocation passes the per-call permission gate, bills through the invoking
run's `ProcessingContext`, and is bounded by a recursion depth cap of 4 and
16 concurrently open streams per run. v1 limits: streaming *inputs* accept
arrays only (no live guest-produced streams), and the body must import the
capability module itself for the facade to mount — the pack's `SKILL.md`
states both imports.

The host backend is `packages/dsl/src/flow/` (internal; `@nodetool-ai/dsl/flow`
exists for the hidden import, not as a public surface — programs that must
open in the editor, be validated, or run on the server still build a graph).
The capability implementation is `packages/agents/src/capabilities/flow.ts`.
Diffs touching either run the `dsl-native-flow` harness selfcheck via
`nodetool harness gate`. Design and pivot record:
[docs/dsl-native-flow-design.md](docs/dsl-native-flow-design.md).

The `-aws`, `-notion`, `-supabase` and `-twilio` packs are the host
case: they replace the S3, Notion, Supabase and Twilio nodes. Each
builds an authenticated request — `-aws` signs one with SigV4 — and **none of
them sends it**. The guest passes what comes back to its own `fetch`, so the
run's fetch cap and SSRF guard still apply. Credentials
come from `nodetool.secrets.get(name)`, which a Code node can narrow to the
names it declares in its `secrets` property. A host pack's manifest entry is
`{"kind": "host", "host": "<id>"}`, and the id resolves only through NodeTool's
own `SANDBOX_HOST_MODULES` table, which pins the one package allowed to declare
it — a third-party pack can never bring host code. The implementations live in
`packages/agents/src/host-modules/`, with every safety limit inside them.

**Apify is not one of them any more.** A `-apify` pack of exactly this shape
existed and was removed: the request-builder pattern requires the guest to hold
the credential (`nodetool.secrets.get("APIFY_API_TOKEN")`) and to do its own
fetching and polling, which is the wrong trade for a service that runs
third-party code, on third-party machines, against a URL a model chose, and
bills for it. Apify is now a **capability module**
(`@nodetool-ai/sandbox-nodetool/apify`): the token never leaves the host, every
actor passes an allowlist and a session budget, actor inputs are SSRF-screened,
cancellation aborts the remote run, and files it produces become NodeTool
assets. See [docs/apify-integration.md](docs/apify-integration.md).

**SerpAPI is a capability module** (`@nodetool-ai/sandbox-nodetool/serpapi`),
and the engine list is discovered rather than declared. SerpAPI is one endpoint
whose `engine` parameter selects which of ~120 contracts applies — Google and
its verticals, Bing, Baidu, DuckDuckGo, Yandex, Naver, YouTube, Amazon, eBay,
Walmart, Yelp, TripAdvisor, the app stores — so `list_serpapi_engines` and
`get_serpapi_engine_schema` read SerpAPI's own engine table and an engine it
ships tomorrow is callable with no diff here. `serpapi_search` runs any of them;
the key stays on the host, `api_key` and `output` are refused from a caller, and
the parameter bag is checked against the engine's contract before the call —
SerpAPI *ignores* an unknown parameter, so a typo is otherwise a billed search
that answers a different question. `web_search` stays what it is: one query
against whichever `SERP_PROVIDER` this install configured. See
[docs/serpapi-integration.md](docs/serpapi-integration.md).

**Google Workspace is a capability module too**
(`@nodetool-ai/sandbox-nodetool/google`), and the only Drive/Gmail/Docs/Sheets/
Calendar surface — the fourteen `lib.google.*` nodes are gone. It authenticates
with the token the user's Google sign-in returns rather than an API key, which
the host resolves and refreshes; a guest never sees it. Its twenty calls are the
fourteen the nodes made plus six they never offered — get one Drive file, get
one Gmail message, list labels, create a spreadsheet, list calendars, delete an
event — and a missing or revoked credential comes back as `{error}` telling the
user to sign in again. A server with no Google login offers none of
it — see `NODETOOL_GOOGLE_WORKSPACE` in
[docs/configuration.md](docs/configuration.md).

**NodeTool's own settings are a capability module**
(`@nodetool-ai/sandbox-nodetool/settings`, also `nodetool.settings.*`), and the
shape of it is the point: `list_settings`, `get_setting` and `set_setting` cover
ordinary configuration, `list_secrets` reports which credentials this install
holds without their values, and there is **no `set_secret`**. The definitions
come from `settingCatalog()` in `@nodetool-ai/config` — the same table the tRPC
settings router answers `settings.list` from — so the capability knows which
names hold credentials instead of guessing from the name, and refuses to read or
write one.

Setting a secret goes through a bespoke dialog. `request_secret` takes a name, a
reason and a help URL — never a value. The host sends a `secret_request` frame,
the user types the key into a card in their own client, that client saves it
with its own `settings.secrets.upsert` call, and the answer coming back
(`secret_request_response`) says `saved` or `declined` and nothing else. The
credential therefore never enters the guest, the websocket payload, the chat
transcript, or the model's context; the run learns only that a secret now
exists, and reads it — if at all — through `nodetool.secrets.get` under its own
declared `secretScope`. The dialog is a host capability, not a fallback: a
headless run (a workflow on the kernel, the CLI, an eval) carries no
`CapabilityRun.secretPrompt` and the call is refused by name rather than
quietly writing something nobody approved.

The last three replaced nodes rather than bridges. `lib.browser.WebFetch`,
`DownloadFile`, `Browser` and `SpiderCrawl` are the `fetch` capability plus
`-html`; `lib.excel.*` is `-xlsx`; `lib.ocr.*` is `-ocr`; and
`lib.tensorflow.*` is `-tfjs`. Each was a chain of
near-identical nodes that one script now expresses; only `lib.browser.Screenshot`
(a real page over CDP) and `lib.sqlite.GetDatabasePath` stayed nodes.

These packs are still not workspaces — no host code may import one — so npm
links nothing into `node_modules` and discovery reads them from disk instead:
`packages/sandbox-packs/` in a checkout, and `_sandbox/` next to `server.mjs`
in the packaged desktop app and the Docker image, where `bundle-backend.mjs`
stages every pack in that directory and `verify-backend-bundle.mjs` fails a
build that misses one. `shippedPackSearchPaths()`
(`packages/node-sdk/src/pack-loader.ts`) resolves both, and puts the shipped
root last: a pack of the same name installed through the Package Manager
shadows the copy in the app. Declaring a specifier from a pack this host does
not carry still fails validation with "Install `<pack>`". See
[packages/sandbox-packs/README.md](packages/sandbox-packs/README.md).

### nodetool affected (Changed-File → Workspace Mapping)

Maps changed files (or the git working tree) to the minimal set of workspaces to
rebuild/test: the owning package plus its downstream dependents, and a
`build:packages` only when a decorator package (loads from `dist/`) is affected.
Avoids reflexively running the full 1–2 min build.

Workspaces come from the root `package.json`, not from a scan of `packages/` —
`reliability/harness` is a workspace too, and a scan of one directory reported
every change under it as belonging to nothing. `reliability/journeys/` maps to
the harness that runs it (`EXTRA_WORKSPACE_PATHS` in
`packages/cli/src/affected/affected.ts`).

```bash
npm run dev:nodetool -- affected                       # uses git working-tree changes
npm run dev:nodetool -- affected --base main           # diff against a ref
npm run dev:nodetool -- affected packages/cli/src/x.ts # explicit files
npm run dev:nodetool -- affected --json
```

### npm run probe:providers (Provider Contract Probes)

Asks OpenAI, Gemini, fal, and KIE for one real response each and decodes it with
the same production decoder a run uses. A cassette proves NodeTool still handles
a response a provider gave us *once*; it cannot notice that the provider changed
the response today.

```bash
npm run probe:providers                      # one request per provider, keys from env
npm run probe:providers -- --json --out report.json
npm run probe:providers -- --only openai.chat-completion
npm run probe:providers -- --strict-network  # also fail on an unreachable provider
```

The offline half needs no key and runs on every diff touching
`packages/runtime/src/providers/`: each manifest entry decodes a checked-in raw
HTTP response fixture, and every declared required field is deleted once to
prove the check can fail
(`npm run test --workspace=packages/runtime -- provider-contract-probes`).

**Network failures are reported apart from schema failures.** No body reaching
the decoder (DNS, timeout, 5xx, an HTML gateway page) is a network failure and
does not fail the nightly job; a response that no longer decodes is a schema
failure and does. Budget: one request and USD 0.05 per provider per run,
enforced by the runner. Retained artifacts hold response *shapes* and redacted
messages, never a body — no credential, prompt, request id, or signed URL
survives. Manifest:
`packages/runtime/src/providers/contract/probe-manifest.ts`. Details:
[docs/provider-contract-probes.md](docs/provider-contract-probes.md).

### nodetool harness (Registry, Coverage Audit, and the Gate)

The machine-readable inventory behind harness-first engineering
([docs/HARNESS_FIRST.md](docs/HARNESS_FIRST.md)): every headless harness in
the repo, every product surface with the code paths it owns, and which
harnesses cover which surface. An uncovered surface must carry a written gap
note; one without it fails `audit` and the registry test. Shipping a new
surface means adding it to `packages/cli/src/harness/registry.ts` — with its
harness or its debt written down.

`gate` makes the registry executable: it maps a diff onto surfaces by path
and runs the selfcheck of every harness covering a touched surface — keyless,
deterministic invocations like `validate:examples`, the Ring 0 reliability
journeys, a shipped-bundle wiring check, the app-build deterministic cases.
The diff selects the checks, not the author. Harnesses that need a target or
key are printed as manual work, never silently skipped.

```bash
npm run dev:nodetool -- harness list             # every harness + capabilities
npm run dev:nodetool -- harness audit            # surface coverage + documented gaps
npm run dev:nodetool -- harness audit --strict   # exit 1 while any gap remains
npm run dev:nodetool -- harness gate --base main # run the selfchecks this diff demands
npm run dev:nodetool -- harness gate --dry-run   # plan only
npm run dev:nodetool -- harness gate --all       # every selfcheck (--expensive to widen)
npm run dev:nodetool -- harness capabilities     # capability coverage + documented gaps
```

`capabilities` is the same invariant one rung down, over
`packages/cli/src/harness/capability-table.ts`: every exported agent capability
names the suites a selfcheck runs over it, the eval cases that drive a model
through it, or a written gap note. The table is derived —
`npm run capabilities:sync` rewrites it from the live registry, the agent
suites and the eval case files, and `npm run capabilities:check` fails when it
is stale or when a new capability arrives with no check and no gap note. It
also carries a fingerprint of what each capability *declares*, so
`harness gate --base <ref>` can refuse a contract change that left its coverage
mapping untouched while saying nothing about an ordinary refactor. See
[packages/agents/AGENTS.md § Capability coverage](packages/agents/AGENTS.md).

### nodetool reliability (Cross-Surface Journey Diffs)

Runs a journey from `reliability/journeys/` on every execution surface it
declares and diffs each non-oracle surface against the kernel oracle. A journey
is a small workflow plus the invariants its run must hold — lifecycle pairing,
terminal uniqueness, cleanup leaks — and what it proves is that the kernel
runner and the ws-server produce the *same* stream for it. Reach for it after a
change to execution: `harness gate` already runs the Ring 0 journeys on such a
diff, and this is how you run one by hand.

Run it from `dist`, not from source: the journey fixtures use decorators, which
the `dev:nodetool` transform rejects (`Decorators are not valid here`). Build
the packages first.

```bash
npm run nodetool -- reliability list                    # journeys + their surfaces
npm run nodetool -- reliability run linear-text-pipeline
npm run nodetool -- reliability run <journey> --surface kernel   # repeatable
npm run nodetool -- reliability run <journey> --faults provider-429 --diff
npm run nodetool -- reliability update-goldens <journey>
```

`--faults` replaces the journey's own matrix for that run. The provider-seam
faults are implemented (`provider-429`, `provider-500`, `provider-timeout`,
`truncated-stream`, `malformed-sse`, `slow-drip`, `cost-omission`); the
`ws`/`bridge`/`host`/`client` names are recognized but report as unimplemented.
`update-goldens` rewrites `expected/` from a fresh unfaulted kernel run — it
cannot tell a fixed bug from a new one, so read the diff before committing it.
Architecture: [docs/RELIABILITY_ARCHITECTURE.md](docs/RELIABILITY_ARCHITECTURE.md).

### nodetool package (Node-Pack Authoring)

Manages TypeScript **node** packages — the packs contributing node types to the
registry — not the sandbox packs `nodetool packs` handles. `init` scaffolds a
package (prompting for name, description, author), `list` reports what this
install has, and `docs` / `node-docs` / `workflow-docs` generate a pack's
Markdown.

```bash
npm run dev:nodetool -- package list [--available] [--json]
npm run dev:nodetool -- package init
npm run dev:nodetool -- package docs [-o docs] [--compact]
npm run dev:nodetool -- package node-docs [-o docs/nodes] [-p <namespace>]
npm run dev:nodetool -- package workflow-docs [-o docs/workflows] [-e <dir>]
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

### nodetool apps

Mini apps as portable artifacts, straight against the local database. An
`ApplicationBundle` is one JSON file carrying the app document plus the full
graph of every workflow its operations bind; inside it an operation's
`workflowId` is a bundle-local key, and import creates the workflows and
rewrites the keys to the new ids. The bundle logic is pure and lives in
`@nodetool-ai/app-runtime`, so the CLI, `POST /api/applications/import-bundle`,
and the example-app installer all produce the same rows.

```bash
npm run dev:nodetool -- apps list                          # id, name, operations, updated_at
npm run dev:nodetool -- apps export-bundle <application_id> -o my.app.json
npm run dev:nodetool -- apps export-bundle <id> --released # the released snapshot, not the draft
npm run dev:nodetool -- apps import-bundle my.app.json --project default
```

A bundled workflow carrying a `sourceId` gets a row id derived from it, so two
bundles that ship the same workflow reuse the row instead of duplicating it —
which is what keeps installing several example apps from filling the library
with copies of one template.

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

### nodetool worker (Rented GPU Workers)

Provisions a RunPod/Vast worker a NodeTool instance attaches to for Python
nodes, and manages the HuggingFace cache on it over the WebSocket bridge — no
server needed for `worker models`. A worker bills by the minute, so
`--idle-timeout` and `stop` are part of the flow.

```bash
npm run dev:nodetool -- worker profile add hf-a40 --target runpod \
  --image ghcr.io/nodetool-ai/nodetool-worker:latest --gpu "NVIDIA A40" --idle-timeout 15
npm run dev:nodetool -- worker create --profile hf-a40 --attach
npm run dev:nodetool -- worker models list                      # attached worker
npm run dev:nodetool -- worker models download --repo-id stabilityai/sdxl-turbo
npm run dev:nodetool -- worker list
npm run dev:nodetool -- worker stop --all
```

Full reference: [docs/cli.md § nodetool worker](docs/cli.md#nodetool-worker),
walkthrough: [docs/worker-deployment.md](docs/worker-deployment.md).

### nodetool telegram (Telegram Bridge)

Turns Telegram private-chat messages into turns on a running server's agent
loop. The bridge holds no credentials and no conversation state — threads,
tools, permissions, and cost tracking stay on the server, which needs
`NODETOOL_INTEGRATION_TOKEN` set or the linking routes do not exist. Long
polling only; `TELEGRAM_WEBHOOK_URL` makes `serve` refuse to start.

```bash
npm run dev:nodetool -- telegram register-commands              # setMyCommands (deploy step)
npm run dev:nodetool -- telegram serve --config ./telegram-bot.json
```

Env: `TELEGRAM_BOT_TOKEN`, `NODETOOL_INTEGRATION_TOKEN`, `NODETOOL_API_URL`.
File (optional): `allowUsers`, `editThrottleMs`, `maxQueuedTurns`. Full
reference: [docs/cli.md § nodetool telegram](docs/cli.md#nodetool-telegram),
design: [docs/telegram-bot-design.md](docs/telegram-bot-design.md).

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

## Observing Agent Execution

NodeTool emits a hierarchy of OpenTelemetry spans that an analyzer agent can
ingest to study and optimize prompts/agents/workflows:

```
workflow.run                       (kernel WorkflowRunner)
  node.process                     (kernel NodeActor — one per node)
    agent.execute                  (Agent.execute)
      agent.plan                   (TaskPlanner / authorGraph / CodePlanner)
        llm.chat / llm.stream      (BaseProvider)
      agent.step                   (CodeActExecutor)
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

See [packages/agents/AGENTS.md](packages/agents/AGENTS.md) for agent architecture, parallel execution, skills, and tuning.

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
- See the **[Primitives Strategy](web/src/components/ui_primitives/STRATEGY.md)** for the full decision tree, migration rules, and 90+ available primitives.
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

> Full guide: [docs/WRITING_STYLE.md](docs/WRITING_STYLE.md). Comment/README rules: [DEVELOPMENT_STANDARDS §19](docs/DEVELOPMENT_STANDARDS.md#19-documentation--comments).

- Write prose — docs, READMEs, this file, PR descriptions, comments — concise and concrete. Cut any sentence that survives deletion without losing meaning.
- **No AI slop.** Forbidden: `leverage`, `utilize`, `seamless`, `robust`, `powerful`, `comprehensive`, `cutting-edge`, `unlock`, `empower`, `streamline`, `it's worth noting`, `dive into`, rule-of-three padding, "it's not just X, it's Y", emoji decoration, and the rest of the [forbidden list](docs/WRITING_STYLE.md#forbidden-expressions).
- Bold-label bullets must add information beyond the label. Claims are concrete: numbers, names, paths — not adjectives.
- When you edit a Markdown file, fix slop you pass in the same change. For code, use the `unslop` skill.

## Technologies

### TypeScript Backend (`packages/`)
- **Node.js 22.22.1**, **TypeScript 5.7**, **ES Modules**
- **Vitest 4** for testing
- Key packages: `@nodetool-ai/websocket` (server), `@nodetool-ai/kernel` (runtime), `@nodetool-ai/cli` (CLI)
- See [packages/AGENTS.md](packages/AGENTS.md) for full package list

### Web
- **React 19.2**, **TypeScript 5.9**, **Vite 8**
- **MUI v7.3** + Emotion, **Zustand 5**, **ReactFlow 12.11**
- **TanStack Query v5**, **React Router v7**
- **Jest 29.7** + React Testing Library 16.3, **Playwright** for E2E

### Electron
- **Electron 39.8.10**, **React 19.2**, **TypeScript 5.9**
- **Zustand 5**, **Vite 8**

### Mobile
- **React Native / Expo** - See [mobile/README.md](mobile/README.md)
