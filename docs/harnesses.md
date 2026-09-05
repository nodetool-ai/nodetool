# Agent harness reference

The full reference for every headless harness, CLI command, and agent tool
surface: what it checks, what it does not simulate, and why it is shaped the
way it is. The index — which harness answers which need — is
[AGENTS.md § Agent Harnesses & Tooling](https://github.com/nodetool-ai/nodetool/blob/main/AGENTS.md#agent-harnesses--tooling).
Flag-level reference for the CLI: [cli.md](cli.md).

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
--cost-cap <usd>         Ceiling on provider spend for one turn, shared by
                         every loop it starts; 0 lifts it. Default:
                         NODETOOL_AGENT_TURN_COST_CAP_USD
--timeout <s>            Wall-clock bound on one turn, in seconds; 0 leaves it
                         no time at all. Default:
                         NODETOOL_AGENT_TURN_DEADLINE_MS
-a, --agent [mode]       [deprecated] No-op
--no-agent               [deprecated] No-op
```

`--cost-cap` and `--timeout` override two of the five `NODETOOL_AGENT_*`
settings a chat turn on the server reads; the other three (concurrency, total
turns, unpriced-token ceiling) come from the settings alone. The budget is one
object per turn, shared by every loop the turn starts — a sub-agent, an
`execute_plan` DAG, an `AgentNode` reached through `run_node` — so a ceiling
bounds the run rather than each loop. A turn a ceiling refuses says which one:
`Stopped: turn budget of $5 reached`. `nodetool agent run` takes the same two
flags, bounding the whole command instead of one turn, and exits non-zero on a
budget stop.

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
[docs/mcp-production.md](mcp-production.md).

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
[docs/workflow-supervisor-design.md](workflow-supervisor-design.md).

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

Three warnings cover the app an agent builds that wires up correctly and still
fails a user. A run button with no `disabledWhen` on `op:<id>/exec#running` is
a race the user drives — no policy refuses the second click, so it cancels the
job and restarts it (`replace`), stacks another run (`queue`), or starts one
alongside (`parallel`). An operation nothing binds `exec#error` to fails
invisibly: the app looks idle and says nothing. And a media input widget —
Image, Sketch Pad, Camera Capture, Audio, Audio Recorder, Video, Document —
filling an input with no default, behind a run trigger guarded on nothing, lets
the run start with the input unset, which is a paid call the user did not get
to fill in. A Workflow Form is not one of those: it renders every input of its
operation rather than binding one, so there is no single binding to guard.

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
keyframes inlined by `web/scripts/build-storyboard-cast-stills.mjs`. The board
is a shot grid, so six cards are two rows and the surface is *shorter* than a
1080-line frame: the loop lays it out in a frame 1.5× smaller and scales it
back up (`zoom` in `demo/src/hero/SurfaceLoop.tsx`) rather than leaving a
third of the frame empty. `panPx`, which scrolled the taller list the board
used to be, is still there for a cast whose surface overflows. Re-render with
`npm run render:surfaces` in `demo/`, then encode
`marketing/public/surface-storyboard.{mp4,webm}` and its `-poster.webp`.

The storyboard's still frames come from `web/scripts/screenshot-trailer-surfaces.mjs`,
which replays the same cast through Playwright: `trailer-storyboard.webp` for
the movie-trailer use-case page, and one hero written to two trees —
`marketing/public/screen_storyboard.png` (landing page, /creatives, the Product
Hunt slide) and `docs/assets/creative-agent/storyboard-surface.png`. Both are
backend-free, so a re-run reproduces them with no server and no credits spent.

### Marketing project screenshots

The landing page's project section (`marketing/src/components/ProjectSection.tsx`)
tells one session end to end, and three of its four frames are the project
views. Those come from the documentation screenshot suite — `npm run screenshots`
in `web/` drives the real app against the seeded projects in
`packages/websocket/src/screenshot-projects.ts` and writes
`docs/assets/screenshots/project-*.png`. `npm run project-shots` (in `web/`)
then re-encodes those PNGs as WebP into `marketing/public/projects/` and writes
`marketing/src/data/projectShots.generated.ts` with the size `next/image` needs.

The two halves are split because only the first needs a browser, a backend and
a seeded database; re-encoding is deterministic and needs none of them. That is
what `npm run project-shots:check` reads: it re-encodes into memory and fails
when a committed WebP or a recorded size has drifted from its source PNG, so a
stale marketing copy cannot ship unnoticed. A shot may declare a `height` to
crop to its top band (the new-project surface pins its blank-document strip to
the bottom of the viewport, leaving 270px of empty column in the middle at
900px) — a crop and nothing else: no compositing, no re-rendering.

The fourth frame is the chat one, and it is the same session on purpose: the
six keyframes rendered in it are the six stills on the board the project frames
show.

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
[docs/mini-app-build-harness-design.md](mini-app-build-harness-design.md).

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
JSON-Schema/TypeScript name instead of NodeTool's (`integer` → `int`), DSL
wiring handles left in a property bag (a connection that was never made), and
Code
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
provider or model the model hallucinated, and one whose model properties are
left unselected (nothing stamps models in at run time, so every Agent node
would die on "Select a model") — and
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
preset that does not exist, baked curves a custom animation could not render
from, timings that cannot render. `debug` runs the same
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
**`edit_sketch`** places an image on a layer as well as editing the layer
stack: `set_layer_image` (or `image` on `add_layer`) points a layer at an asset
id, an `asset://` locator, a data: URL or an http(s) URL, and the editor
resolves and draws it on load — the same reference a sketch seeded from an
asset carries, so nothing inlines a bitmap into the document. An asset id that
resolves to nothing is refused rather than stored, because a stored one shows
up as an empty layer. With an editor open, **`ui_sketch_place_image`** does the
same against the live canvas.

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
([docs/js-script-document-design.md](js-script-document-design.md)). The
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
on a model nobody chose.

**The still is optional, per shot.** A shot's `render_mode` decides where its
clip comes from: `"keyframe"` (the default) animates the selected still with
`image_to_video`, `"direct"` skips the still and generates from the prompt with
`text_to_video`. Set it with `edit_storyboard`, or pass `mode` to
`render_storyboard_clips` to override every selected shot for one call.
`render_storyboard_stills` skips direct shots unless they are named in
`targets`.

Keyframe stays the default because it is what makes a board affordable and
coherent: a still is the cheap unit to iterate on and the anchor that holds a
character, a palette and a lighting setup steady across shots. Direct earns its
place on two shapes. First-frame conditioning biases the sampler toward the
reference appearance, so a heavy-motion shot comes out stiffer than the same
model's `text_to_video`. And the native-audio models (synced dialogue, diegetic
sound) are weakest on their image path. A direct shot's prompt therefore carries
the framing and the board style too, since no still carries them in.

The prompts, entity seasoning, and shot → timeline
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

### Shipped compositions

A composition is a group clip with parameters, stored as a JSON asset carrying
`metadata.nodetool_composition` the way entities carry their marker. Six ship
with the product in `packages/base-nodes/nodetool/examples/compositions/`
(title card, lower third, caption bar, callout, end card, logo sting), built
from the spec in `scripts/example-compositions/compositions.mjs` by
`node scripts/build-example-compositions.mjs` (`--check` fails when a bundle
drifts from its spec). The directory is registered in
`PACKAGE_RUNTIME_ASSETS`, so the backend bundle stages it and the verifier
checks it. Agents reach them through `list_compositions`, `get_composition`,
`save_composition` (extract a group from a saved timeline), `delete_composition`
and the `edit_timeline` op `insert_composition`; the pure
`instantiateComposition`/`extractComposition` live in
`packages/timeline/src/composition.ts`.

### Shipped recipes

A recipe is a named outcome plus the ordered example workflows that reach it —
"one packshot per SKU becomes the whole channel set", four to six shipped
workflows deep. The manifests are
`packages/base-nodes/nodetool/examples/recipes/<slug>.recipe.json` (the
`recipes` sibling of the example workflows, where `exampleRecipesDir` looks by
default in the monorepo, the packaged backend, and the server image). They hold
no graphs: each step names a shipped example, and
`listExampleRecipes` (`packages/websocket/src/lib/example-recipes.ts`) resolves
those names against the examples the install actually ships, reading each
step's node count, thumbnail and models out of the graph. A recipe with a step
that no longer resolves is dropped from the listing rather than half-offered.

`workflows.recipes` serves them; the web app shows them above the gallery on
**Examples**, where a step opens that example as a workflow and "Add all"
copies the whole chain into the library. The site builds its `/recipes` pages
and the downloadable `.nodetool` bundles from the same manifests
(`marketing/scripts/generate-recipes.mjs`, with the sample renders and page
order in `marketing/scripts/recipes.mjs`), so the page and the product name one
list of workflows. `npm run validate:examples` checks every step, alternative
and hero resolves; `scripts/verify-backend-bundle.mjs` checks the manifests and
the examples they name were staged into the packaged bundle.

### 3D scene tools (no editor, no browser)

An agent builds and fixes a 3D model without an editor open:
**`list_model3ds`** finds the `.glb`/`.gltf` assets, **`create_model3d`** makes
one holding an empty glTF scene (optionally applying operations in the same
call), **`get_model3d`** lists every object with its transform, visibility and
material color plus the scene's world-space bounds, **`edit_model3d`** runs the
`ui_3d_*` verbs — add and delete primitives and lights, set transforms, rename,
show and hide, recolor, select — against the stored document and saves it back
over the same asset, **`validate_model3d`** checks a document statically,
and **`render_model3d`** renders one through headless Blender and stores the
PNG.

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

### Godot game pipeline (templates, slot nodes, project export)

A 2D game is a Godot template plus the assets that fill its slots.
**`list_game_templates`** lists the shipped Godot 4.3 projects (platformer,
top-down, shoot-em-up) with the slot manifest each one declares: sprite sheets
with named animations and frame counts, tilesets, seamless backgrounds, sound
effects, a music loop, and the hook scripts an agent edits after export. The
`nodetool.game.*` nodes fill one slot each and stamp the fill on the stored
asset under `metadata.nodetool_slot`: `SpriteSheet` derives frame ranges from
a generated sheet and the cell size, `Tileset` counts tiles, `SeamlessImage`
measures the opposite edges, `SoundEffect` trims to the slot's length, and
`MusicLoop` crossfades the tail into the head. **`export_godot_project`** takes
the template id and one asset per slot, checks every fill against the
manifest, copies the template into a workspace directory, writes the
`SpriteFrames` and `TileSet` resources with atlas regions from the fills and
collision on the tiles the slot's `solid` list names, copies the asset bytes
to the paths the scenes reference, and reports any `res://` reference no file
answers. Exporting again into a directory that already holds a project
refreshes the resources and assets and keeps every script and scene as it is,
so an art change does not undo the hook edits; `overwrite` starts over. **`verify_godot_project`** runs
headless Godot over a project directory: import, `--check-only` on every
script, and `test/smoke.gd` for sixty physics frames. Both say when Godot
could not run (no binary, or a virtual workspace) rather than reporting green.

The slot contract and the acceptance check are `@nodetool-ai/protocol`
(`game-assets.ts`, fixture under `fixtures/game-assets/`), the resource writer
and reference checker are `@nodetool-ai/godot`, the templates and the runner
are `@nodetool-ai/godot-templates`. A template's placeholders sit at the
exact paths the writer emits, so the template runs before any asset exists
and a filled export replaces files without touching a scene. Godot is found
through `GODOT_BIN` or `godot`/`godot4`/`Godot` on `PATH`; the suites that
need it skip with a named reason when it is absent. Implementations:
`packages/agents/src/capabilities/godot.ts`.

### Entity library tools (no browser)

The reusable production entities — characters, locations, styles, props — are
image assets carrying a marker under `metadata.nodetool_entity`.
**`list_entities`** lists them (filtered by kind or text), **`get_entity`**
reads one in full, and **`apply_entities`** pastes their descriptors into a
prompt and returns the reference-image asset ids to pass to an image model.
**`create_entity`** tags one of the caller's image assets as an entity (the
same marker write the browser's Save Entity does; generate or save the image
first), **`update_entity`** changes an existing entity's fields or moves it to
a new photo via `asset_id`, and **`delete_entity`** untags one (marker cleared,
asset kept).

The injection rule is `injectEntities` in `@nodetool-ai/protocol`, shared with
the browser's `ui_entity_apply` and the Director node: with explicit
`entity_ids` exactly those apply, otherwise the entities whose name appears in
the text (all of them when the text is empty). An id that resolves to nothing
comes back in `missing_entity_ids` — otherwise the prompt returns unseasoned
and looks fine. Implementations:
`packages/agents/src/capabilities/entities.ts`.

### Media analysis tools (no model, no ffmpeg)

`understand_video` asks a model what a clip is about. These five measure what
it **is**, and an agent could not get at any of it before without shelling out
to `ffprobe` and parsing text.

| Tool | Answers |
|---|---|
| `analyze_audio` | Duration, sample rate, channels, codec; EBU R128 integrated loudness and loudness range, peak/RMS dBFS, crest factor, clipped samples, DC offset; an RMS/peak envelope over time with the loudest and quietest moments |
| `analyze_audio_spectrum` | Ten named octave bands (sub_bass → air) with each one's share of the energy, the dominant frequency, and spectral centroid/rolloff/flatness/bandwidth averaged and as a series |
| `detect_audio_events` | Silence and sounding segments, onset times, tempo in BPM with a confidence |
| `analyze_video` | Duration, resolution, frame rate, rotation, both codecs; brightness, contrast, saturation and motion per sampled frame; dominant palette; darkest, brightest and busiest moments |
| `detect_video_scenes` | Cut times and per-shot start/end/duration/brightness/motion/palette, plus black-frame and frozen-frame runs |

They take the same reference forms `read_media_bytes` takes — an asset id, an
`asset://` URI, a `/api/storage/` key, a URL, a `data:` URI — and a video's
soundtrack is a valid `analyze_audio` target, so a clip needs no demux first.

**Decoding is Mediabunny's**, the library the sandbox's `audio.*`/`video.*`
already use, so none of this depends on ffmpeg being installed.
`nodetool.audio.GetAudioInfo` is the contrast: it sniffs magic bytes, and
reports a duration only for WAV.

Loudness follows ITU-R BS.1770-4 with EBU Tech 3342 for the range, K-weighted
at the file's own sample rate rather than through 48 kHz coefficients — so
`packages/agents/tests/audio-dsp.test.ts` can pin the scale's own anchor, a
1 kHz sine at -20 dBFS on two channels reading -20.0 LUFS. Cuts are decided
from the luma histogram, not from a pixel difference, so a whip pan inside one
shot does not read as an edit.

Two things the answers say about themselves rather than leaving to be assumed.
Every series is decimated to a point budget and every decode stops at a
duration cap, both reported (`decimated`, `truncated`). And `tempo.reliable`
is false unless the novelty curve carried at least four onsets and the
autocorrelation actually found a period — speech and room tone otherwise
produce a confident-looking BPM from nothing.

The math is pure and lives apart from the capability:
`packages/agents/src/analysis/audio-dsp.ts` (FFT, spectral features, K-weighted
gated loudness, silence, onsets, tempo) and `video-frames.ts` (per-frame
statistics, histograms, motion, palettes, cuts), both tested on signals whose
answers are known analytically. `media-decode.ts` is the Mediabunny seam.

### Live browser tools (your own signed-in Chrome)

The `browser_*` capabilities drive one real Chrome page action by action —
`browser_view` (URL, title, indexed interactive elements, screenshot),
`browser_navigate`, `browser_click`, `browser_input_text`, `browser_press_key`,
`browser_select_option`, `browser_move_mouse`, `browser_scroll`,
`browser_console_exec`, `browser_console_view`, `browser_capture_media`,
`browser_upload_asset`, `browser_restart`, `browser_status`. Element indexes
are rebuilt on every view, so a caller views before it acts on an index.

The page is either a headless Chrome the process launched or, through the
**Chrome extension** relay on `/ws/extension`, the tab the user is already
signed in to — cookies, sessions and 2FA in place, which is what makes
Midjourney, Sora and the rest reachable at all. The action loop is the same
either way, so only two capabilities mention transports: `browser_status`
reports the one in force (and whether an extension is actually attached, so an
agent learns that before spending a 30-second attach timeout), and
`browser_restart` changes it.

The action loop is its own package, **`@nodetool-ai/browser`** — `CdpPage`,
the session, media capture, file upload, and the extension transport — and it
knows nothing about agents, nodes, assets or workflows: inputs are plain
values, a screenshot comes back as base64. The capability module
(`packages/agents/src/capabilities/browser.ts`) imports it directly and owns
the half that needs a `ProcessingContext`, turning those bytes into an asset
reference and an asset id into bytes. That split is what lets the capabilities
and the `lib.browser.Screenshot` node share one implementation. One session
exists per process and every caller shares it — which is why the cloud profile
drops them all (`packages/agents/src/browser-gate.ts`): one shared page
across tenants is a single-tenant shape, and the node catalog already agreed by
leaving `lib.browser` out of `CLOUD_NODE_NAMESPACES`. Extension setup, the wire
protocol and its limits: [docs/chrome-extension.md](chrome-extension.md).

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

**Running a suite from CI.** The suites that drive a model run **on request**:
`.github/workflows/agent-eval.yml` is `workflow_dispatch` only, with inputs for
the suites, the provider, the model, the cases, and a floor that overrides every
suite's default for that run. Each suite carries a default floor recorded in the
workflow next to the reason for the number; the run uploads each suite's JSON
and renders one table across all of them. It reports — it opens no PR, is not a
required check, and starts on nobody's schedule, because a model run costs money
and varies enough that an automatic red would as often mean an average night as
a regression.

Two flags exist for the free half. `nodetool eval <suite> --list` marks the
cases that need no API key and no network, and `--keyless` runs exactly those,
asking the suite rather than naming ids (a suite with none refuses the flag).
`--min-cases <n>` fails a run that examined fewer cases than that — the failure
a success rate cannot express, since a suite reports 0 over an empty set and
100% over the survivors of a set that shrank.

**No API key? Use the Claude Agent provider.** In keyless environments —
Claude Code on the web, CI sandboxes — the `claude_agent_sdk` provider runs
every eval suite on the session's own Claude credentials, no secret store
needed. In the web sandbox (uid=0) set `IS_SANDBOX=1` so the nested CLI
accepts the permission bypass:

```bash
IS_SANDBOX=1 npm run dev:nodetool -- eval graph-planner -p claude_agent_sdk -m claude-sonnet-5
```

Details on env stripping and the uid=0 blocker:
[docs/AGENTS.md § Claude Agent SDK](https://github.com/nodetool-ai/nodetool/blob/main/docs/AGENTS.md#claude-agent-sdk).

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
[docs/codeact-design.md](codeact-design.md)) on offline instrumented
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
`model3d-tools`, `app-tools`, `memory-tools`, and `creative-pipeline`.
Same flags, metrics, and `--min-success` CI gate as `graph-planner`. Details:
[packages/agents/AGENTS.md](https://github.com/nodetool-ai/nodetool/blob/main/packages/agents/AGENTS.md).

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

An **`app-build`** suite scores `nodetool app build` end to end:
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

### nodetool jtbd (Jobs To Be Done — the optimization loop)

An eval suite scores a model. A job asks whether the **product** let the agent
get something done, and keeps enough of the run that an outer agent can say what
to change.

A job is one objective taken end to end across whatever surfaces it needs,
stated the way a user would state it ("when I have a scene to shoot, I want it
broken into shots, so I can see the coverage before I spend on renders"), handed
to the agent in the user's own words, and graded on the world it left behind.
No job names a tool: which tool to reach for, in what order, is what is under
test. The worlds are the same headless bridges the `tool-loop` suites drive, so
a job cannot drift from the tool contract those suites pin.

```bash
npm run dev:nodetool -- jtbd list [--json]
npm run dev:nodetool -- jtbd run -p anthropic -m claude-sonnet-5
npm run dev:nodetool -- jtbd run --jobs workflow-from-prompt,timeline-assemble-cut -p openai -m gpt-5.4-mini
npm run dev:nodetool -- jtbd run -p anthropic -m claude-sonnet-5 --min-achieved 0.8
npm run dev:nodetool -- jtbd optimize -p openai -m gpt-5.4-mini   # review the recorded runs
```

`run` writes one bundle per job under `nodetool-debug/jtbd/<job>/`:
`report.json` (transcript, tool calls, outcomes, friction) and `review.md`, the
same thing rendered for a person to read. **The transcript is the point.**
`runToolLoop` used to drain the provider stream and discard every
`ProviderMessageEvent`, so a run recorded which tools fired but never what the
model was told or what it said between calls — enough to score a run, not enough
to diagnose one. It now keeps the whole conversation.

Before any model reviews a run, the pure pass in
`packages/agents/src/jtbd/friction.ts` derives what a transcript decides on its
own, and each signal names an owner. A tool that errored repeatedly, or answered
the same call identically three times, is a **harness** finding — the fix is a
schema or an error string in our code. A run that called no tool at all is a
**prompt** finding. A run that took twice the turns it should have is
**unattributed**, because whether that is a prompt failing to describe the short
path or a tool surface forcing the long one is exactly the judgement a pure pass
cannot make. A rule that guesses confidently sends the fix to the wrong file.

`optimize` is the outer half: it hands one run — the system prompt verbatim,
every assistant turn, every call with its arguments and result — to a *different*
model and asks what one change would make the next run go better. It must name a
target and a change; "improve the prompt" is rejected by the parser. Proposals
land in `proposals.json` next to the run.

**It proposes; it never applies.** Nothing in the loop edits a prompt or a tool.
That is the anti-slop ratchet's posture — it opens a PR, it merges nothing —
and for the same reason: a loop that rewrote its own prompts on a model's say-so
would have no reviewable step between a bad diagnosis and a shipped regression.

Run and review are separate commands because the bundle is the handoff. A run
costs model time; reviewing it is a different model, a different prompt, often a
different day. Splitting them means a bundle can be re-reviewed with a better
optimizer without paying for the runs again, and that a person can read the
transcript before any model proposes anything.

The catalogue's own invariants are tested rather than trusted
(`packages/agents/tests/jtbd-friction.test.ts`): every job states a purpose,
grades at least one outcome, names no tool in its objective, and **fails its own
checks on an untouched world** — a job whose outcomes pass before the agent does
anything is measuring nothing.

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
[docs/sandbox-package-design.md](sandbox-package-design.md) § Config-only
modules from npm packages.

**Every library the sandbox offers is an importable pack.** There is no library
global — the `data.*` namespace is gone. The packs live in
`packages/sandbox-packs/`, each a package.json manifest plus a SKILL.md, and
every one of them is available out of the box. The current list — which library
each wraps and whether it runs guest-side or host-side — is the table in
[packages/sandbox-packs/README.md](https://github.com/nodetool-ai/nodetool/blob/main/packages/sandbox-packs/README.md); read it
there rather than from a copy that drifts.

**guest** means the compiler bundles the library into QuickJS. **host** means it
runs where the sandbox runs — needed when the library wants Node builtins or a
DOM, when it carries a limit the guest could not enforce on itself (zip's
50 MB inflation cap), or when the code is NodeTool's own and a config-only pack
therefore cannot ship it.

Two packs are authored guest code rather than a library: `-dsl` builds a
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

One module per node namespace, generated by the
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
[docs/dsl-native-flow-design.md](dsl-native-flow-design.md).

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
assets. See [docs/apify-integration.md](apify-integration.md).

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
[docs/serpapi-integration.md](serpapi-integration.md).

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
[docs/configuration.md](configuration.md).

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
[packages/sandbox-packs/README.md](https://github.com/nodetool-ai/nodetool/blob/main/packages/sandbox-packs/README.md).

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
[docs/provider-contract-probes.md](provider-contract-probes.md).

### nodetool harness (Registry, Coverage Audit, and the Gate)

The machine-readable inventory behind harness-first engineering
([docs/HARNESS_FIRST.md](HARNESS_FIRST.md)): every headless harness in
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
key are printed as manual work, never silently skipped. A selfcheck with
`cost: "expensive"` (a Blender render, the packaged-backend bundle) is skipped
by default even when its surface is touched; pass `--expensive` to include it.

```bash
npm run dev:nodetool -- harness list             # every harness + capabilities
npm run dev:nodetool -- harness audit            # surface coverage + documented gaps
npm run dev:nodetool -- harness audit --strict   # exit 1 while any gap remains
npm run dev:nodetool -- harness gate --base main # run the selfchecks this diff demands
npm run dev:nodetool -- harness gate --dry-run   # plan only
npm run dev:nodetool -- harness gate --all       # every selfcheck (--expensive to widen)
npm run dev:nodetool -- harness gate --strict    # also fail on a touched gap surface
npm run dev:nodetool -- harness gate --timeout 900   # per-selfcheck timeout, in seconds
npm run dev:nodetool -- harness capabilities     # capability coverage + documented gaps
```

A changed file the registry's `paths` cannot place on any surface fails the
gate outright, as long as it looks like source rather than prose, a test, or
config: a new file the registry has never heard of is exactly the case a
coarse-grained `paths` list is meant to catch. `--strict` widens that to a
touched surface only a gap note covers, the ratchet to pull once a gap is
closed. `--timeout <seconds>` bounds each selfcheck; one that runs past it is
killed and counted as a failure, so a hang fails the gate instead of the CI
job's own timeout cutting it off with no verdict. The Quality Gate's
`harness-gate` leg (`.github/workflows/quality-checks.yml`) runs `harness
gate --base origin/main --timeout 900` on every PR and `harness gate --all`
on push to main, so this is exercised on every diff, not only when an agent
remembers to run it locally.

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
[packages/agents/AGENTS.md § Capability coverage](https://github.com/nodetool-ai/nodetool/blob/main/packages/agents/AGENTS.md).

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

# Rewrite saved Code node bodies for the `inputs` object. A declared input used
# to arrive as a global of its own name, so an old body ReferenceErrors on its
# first read. The rewrite is done on the AST — a name in a string, a comment, an
# object key, or a local binding is left alone — and is safe to re-run.
npm run dev:nodetool -- workflows migrate-code-inputs --dry-run
npm run dev:nodetool -- workflows migrate-code-inputs [--user-id <id>] [--json]
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

Aggregates the per-call cost records NodeTool tracks for every provider call,
read straight from the local DB — no server needed. LLM calls carry token
counts; image, video and audio generation carries the billing unit, the
quantity and the unit price behind the charge (`costs list` prints them in a
`units` column, e.g. `5 × seconds @ $0.2050`).

```bash
npm run dev:nodetool -- costs summary                           # Overall + per-provider/model
npm run dev:nodetool -- costs list --limit 20                   # Recent calls
npm run dev:nodetool -- costs list --provider anthropic         # Filter by provider/model
npm run dev:nodetool -- costs by-provider                       # Grouped by provider
npm run dev:nodetool -- costs by-model --provider openai        # Grouped by model
```

Generation spend reaches the ledger through `attachRunCostLedger`
(`@nodetool-ai/execution`), which `ExecutionSession` attaches to every run — so
a CLI run, a debug run, an app run and the websocket server all record the same
way, once. A node that knows its own charge (FAL, kie) reports it with
`context.setProviderCost()` and that number wins, reconciled to the provider's
actual billed amount afterwards where a billing API exists. Everything else is
priced off `@nodetool-ai/model-pricing` from the `prediction` message the
capability call emits. A `nodetool generate` run records its own row: it calls
the provider directly and no runner would see it.

**A model in no price catalog still gets a row, with a null cost.** It shows in
`list` as `unpriced` and is counted as `unpriced` in every aggregate, so the
totals read as a lower bound rather than as free — an empty report is worse
than no report.

### nodetool generations

The record of every media generation — image, video, audio, 3D — read from
the local database. A generation is one provider call, tracked as a
`predictions` row opened *before* the call (`running`) and closed with its
outcome (`completed`, `failed`, `cancelled`, or `interrupted` when a restart
orphaned it), its cost, the provider's request id, and the assets it produced.
Every surface that asks a provider for media goes through
`ProcessingContext.runGeneration` (or `runGenerationWith` around a call the
capability switch has no case for), and
`packages/execution/tests/generation-seam-audit.test.ts` fails on a provider
media call outside it. Design:
[docs/media-generation-tracking-design.md](media-generation-tracking-design.md).

```bash
npm run dev:nodetool -- generations list [--status running] [--provider fal] [--capability text_to_video] [--thread-id <id>] [--job-id <id>] [--since <iso>] [--json]
npm run dev:nodetool -- generations get <generation_id> --json
npm run dev:nodetool -- generations await <generation_id> [--timeout 300]   # exit 1 while still running
npm run dev:nodetool -- generations cancel <generation_id>
npm run dev:nodetool -- generations reconcile <generation_id>              # ask the provider what it billed
npm run dev:nodetool -- generations sweep                                  # close orphaned rows, drain the reconcile queue once
```

Reconciliation is a queue on the table: a row with a provider request id and
no billed amount yet is retried with backoff (1, 5, 30, 120, 720 minutes) by a
worker the server starts, and a provider with no billing API leaves the queue
as `unavailable`. FAL and kie reconcile; the sweep runs at every server start.

Agents reach the same record through the `generations` capability module
(`list_generations`, `get_generation`, `await_generation`,
`cancel_generation`, `reconcile_generation`), and every generation capability
(`generate_image`, `generate_video`, `generate_speech`, the storyboard
renders, …) returns the `generation_id` next to the asset. `background: true`
returns the id at once and leaves the follower to finish the job; at most 16
may be open per run, and `await_generation` collects them.

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
[packages/runtime/src/providers/oauth/README.md](https://github.com/nodetool-ai/nodetool/blob/main/packages/runtime/src/providers/oauth/README.md).

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

Full reference: [docs/cli.md § nodetool worker](cli.md#nodetool-worker),
walkthrough: [docs/worker-deployment.md](worker-deployment.md).

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
reference: [docs/cli.md § nodetool telegram](cli.md#nodetool-telegram),
design: [docs/telegram-bot-design.md](telegram-bot-design.md).

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

See [packages/agents/AGENTS.md](https://github.com/nodetool-ai/nodetool/blob/main/packages/agents/AGENTS.md) for agent architecture, parallel execution, skills, and tuning.
