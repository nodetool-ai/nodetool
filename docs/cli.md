---
layout: page
title: "NodeTool CLI"
description: "The `nodetool` command-line interface — manage servers, workflows, jobs, assets, and secrets from your terminal."
---



The `nodetool` CLI is the TypeScript command-line interface for the NodeTool platform. It manages servers, workflows, jobs, assets, and secrets. Run `nodetool --help` to see the top-level command list. Every sub-command exposes its own `--help` flag with detailed usage.

## Installation

Install globally from npm to get the `nodetool` and `nodetool-chat` commands:

```bash
npm install -g @nodetool-ai/cli
```

Or run a single command without installing:

```bash
npx --package=@nodetool-ai/cli nodetool --help
npx --package=@nodetool-ai/cli nodetool-chat
```

**Requires Node.js 22.x.** Check with `node --version`; install via [nvm](https://github.com/nvm-sh/nvm) if needed.

## Getting Help

- `nodetool --help` — list all top-level commands.
- `nodetool <command> --help` — show command-specific options (e.g. `nodetool serve --help`).
- `nodetool <group> --help` — list sub-commands for grouped tooling (e.g. `nodetool workflows --help`).

## Global Options

These flags work on any `nodetool` command and control [OpenTelemetry tracing](https://github.com/nodetool-ai/nodetool/blob/main/docs/AGENTS.md):

- `--trace-file <path>` — append every LLM/agent/workflow span to `<path>` as JSONL (analyzer-friendly).
- `--trace-stdout [format]` — stream spans to stdout: `pretty` (default) or `json`.
- `--no-trace-stdout` — disable stdout span output (overrides `NODETOOL_TRACE_STDOUT`).

```bash
nodetool --trace-file trace.jsonl run workflow.ts
nodetool --trace-stdout pretty workflows run <id>
```

## Core Commands

### `nodetool info`

Display system and environment information including Node.js version, platform, and API key configuration.

**Options:**

- `--json` — output as JSON.

**Example:**

```bash
nodetool info
nodetool info --json
```

### `nodetool serve`

Starts the TypeScript WebSocket + HTTP backend server. This serves the REST API, WebSocket endpoints, and static assets.

**Options:**

- `--host` (default `127.0.0.1`) — bind address (use `0.0.0.0` for all interfaces).
- `--port` (default `7777`) — listen port.

**Examples:**

```bash
# Start the server on the default port
nodetool serve

# Bind to all interfaces on a custom port
nodetool serve --host 0.0.0.0 --port 8080
```

`serve` passes the two flags to the server as `HOST` and `PORT`, overwriting whatever those variables already held — use the flags, not the environment, to move the server.

### `nodetool workflows run <workflow_id_or_file>`

Executes a workflow by ID (from the local database), JSON file, or TypeScript DSL file.

**Arguments:**

- `<workflow_id_or_file>` — workflow ID, path to a `.json` workflow file, or path to a `.ts` DSL file.

**Options:**

- `--params <json>` — JSON string of workflow parameters.
- `--json` — output result as JSON.
- `--supervise` and its bounds — see [Supervised runs](#supervised-runs).

**Examples:**

```bash
# Run workflow by ID
nodetool workflows run workflow_abc123

# Run workflow from JSON file
nodetool workflows run ./my_workflow.json

# Run workflow from TypeScript DSL
nodetool workflows run ./my_workflow.ts

# Run with parameters as JSON
nodetool workflows run workflow_abc123 --params '{"input": "hello"}'

# JSON output for automation
nodetool workflows run ./my_workflow.json --json
```

### `nodetool workflows export-dsl <workflow_id_or_file>`

Exports a workflow as a TypeScript DSL file.

**Arguments:**

- `<workflow_id_or_file>` — workflow ID or path to a `.json` workflow file.

**Options:**

- `-o, --output <file>` — write to file instead of stdout.

**Examples:**

```bash
# Print DSL to stdout
nodetool workflows export-dsl workflow_abc123

# Write to file
nodetool workflows export-dsl workflow_abc123 -o workflow.ts

# Export from JSON file
nodetool workflows export-dsl ./my_workflow.json
```

### `nodetool run <dsl-file>`

Shorthand for running a TypeScript DSL workflow file directly.

**Options:**

- `--json` — output results as JSON.
- `--supervise` and its bounds — see [Supervised runs](#supervised-runs).

**Examples:**

```bash
nodetool run workflow.ts
nodetool run workflow.ts --json
```

## Supervised runs

`--supervise` puts an agent on the failure path: when a node invocation throws
after its own error handling is exhausted, the agent sees the failure and
answers with one verdict — retry, repair the output, skip the item, or fail.
Without the flag nothing changes: no escalation is constructed and the run is
the run it was before.

Available on `nodetool run`, `nodetool workflows run`, and `nodetool debug`
(server surface).

**Options:**

- `--supervise` — supervise this run. Off unless passed.
- `--max-decisions <n>` — decisions allowed in the run (default 10).
- `--max-retries <n>` — retries per node invocation (default 2).
- `--supervisor-cost-cap <usd>` — ceiling on supervisor spend (default 0.50),
  enforced by reservation before each model turn, not after.
- `--supervisor-model <provider/model>` — who supervises (default
  `anthropic/claude-sonnet-4-6`, or `NODETOOL_SUPERVISOR_MODEL`). The leading
  segment must be a registered provider; the rest is the model id, slashes and
  all (`openrouter/openai/gpt-5.4-mini`).

Passing a bound without `--supervise` is an error rather than a silent
unsupervised run.

**Output.** Each decision prints a `⛨` line as it happens, and the run ends
with a supervised summary:

```
⛨ fetch-item [3] skipped — HTTP 404 (agent, $0.0041)
⛨ supervised: 2 skipped, 1 retried, 3 decisions, +$0.0200
```

With `--json`, the decisions are in `interventions` — alongside the outputs in
`workflows run`, and under `{results, interventions}` in `nodetool run`, whose
bare results shape is left alone for unsupervised runs. `nodetool debug` puts
them in `server.summary.interventions` with a `server.supervised` rollup. Each
record carries the
escalation the agent saw (node, item lineage, redacted inputs, allowed
actions), the verdict, who decided it (`agent`, `sticky`, `bounds`, `default`,
`kernel`), and its cost.

**Cost.** Supervisor spend lands in the same ledger `nodetool costs` reads, one
row per billable decision, attributed to the run and tagged `supervisor` in
`node_type` — so supervision is separable from the workflow's own spend:

```bash
nodetool costs list --limit 20        # supervisor rows show node_type=supervisor
```

**Bounds are the guarantee.** Every supervisor failure (timeout, an unparseable
verdict, an exhausted budget, a cancelled run) resolves as `fail`, which is
what would have happened without it. What each verdict means and why
retry is opt-in per node: [workflow-supervisor-design.md](workflow-supervisor-design.md).

## Database Migrations

### `nodetool db migrate`

Applies NodeTool migrations to a PostgreSQL/Supabase database. For Supabase, use the **direct connection URL** from Settings → Database (port `5432`), not the transaction pooler URL.

**Options:**

- `--direct-url <url>` — Supabase/PostgreSQL direct connection URL.
- `--database-url <url>` — connection URL; defaults to `DIRECT_URL` or `DATABASE_URL`.
- `--target <version>` — stop after a specific migration version.
- `--dry-run` — show pending migrations without applying them.
- `--skip-checksums` — skip checksum validation.
- `--json` — output as JSON.

**Examples:**

```bash
DIRECT_URL="postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres" \
  nodetool db migrate

nodetool db status --direct-url "$DIRECT_URL"
nodetool db migrate --direct-url "$DIRECT_URL" --dry-run
```

Other migration commands:

```bash
nodetool db status   --direct-url "$DIRECT_URL"
nodetool db baseline --direct-url "$DIRECT_URL"   # for existing DBs
nodetool db rollback --direct-url "$DIRECT_URL" --steps 1
```

## Chat

### `nodetool chat`

Starts an interactive TUI chat session.

**Options:**

- `-p, --provider <provider>` — LLM provider (e.g., `anthropic`, `openai`, `ollama`).
- `-m, --model <model>` — model ID.
- `-a, --agent` — **deprecated, no-op.** Every chat session runs the unified agent loop; this flag has no effect.
- `-u, --url <url>` — WebSocket server URL (default: uses a local provider).
- `-w, --workspace <path>` — workspace directory for file operations (default: current directory).
- `--tools <tools>` — comma-separated list of enabled tools.

**Examples:**

```bash
# Start interactive chat
nodetool chat

# Chat with a specific provider and model
nodetool chat --provider anthropic --model claude-sonnet-5

# Connect to a running server
nodetool chat --url ws://localhost:7777/ws
```

## Workflow Management

### `nodetool workflows`

Manage workflows. Reads the local database by default; `--api-url` targets a remote server.

**Subcommands:** `list`, `get`, `run`, `export-dsl`, `export-example`, `export-bundle`, `import-bundle`,
`migrate-code-inputs`

```bash
# List all workflows
nodetool workflows list
nodetool workflows list --api-url http://localhost:7777 --json

# Get a workflow by ID
nodetool workflows get <workflow_id>

# Run a workflow (see above for full options)
nodetool workflows run <workflow_id_or_file>

# Export as a TypeScript DSL file (see above)
nodetool workflows export-dsl <workflow_id_or_file>
```

#### `nodetool workflows export-example <workflow_id_or_file>`

Export a workflow as a shipped template: materialize its referenced assets into the package's constant asset directory
(rewriting refs to `package://<pkg>/<file>`) and write the example JSON.

**Options:**

- `--package <name>` — owning package (default `nodetool-base`).
- `-o, --output <file>` — write the example JSON to this exact path.
- `--include-remote` — also materialize http(s) and local-file refs.

```bash
nodetool workflows export-example <workflow_id>
nodetool workflows export-example <id> --package nodetool-base
nodetool workflows export-example workflow.json -o example.json
```

#### `nodetool workflows export-bundle <workflow_id_or_file...>`

Export one or more workflows as a portable `.nodetool` bundle (a zip containing the graphs plus the bytes of every asset
they reference), sharable as a single file.

**Options:**

- `-o, --output <file>` — output path (default `<name>.nodetool`).
- `--include-remote` — also embed http(s) and local-file refs.

```bash
nodetool workflows export-bundle <id> [<id2> ...] -o my-pack.nodetool
```

#### `nodetool workflows import-bundle <bundle_file>`

Import a `.nodetool` bundle into the local library: store its assets and create the workflows with refs rewritten to the
imported assets.

```bash
nodetool workflows import-bundle my-pack.nodetool
```

### `nodetool validate <workflow_id_or_file>`

Check a workflow against the node registry **without running it**: unknown node
types, missing required properties, dangling or mis-typed edges, model
properties naming a provider or model id that does not exist, and
`nodetool.code.Code` bodies that never return or leave an output unset. It
finishes in well under a second, which makes it the cheap pre-flight before a
run that costs money.

The target is a workflow id, a workflow JSON file, or a TypeScript DSL file.
File targets need no database.

**Options:**

- `--json` — print the full validation report as JSON.
- `--warnings-as-errors` — exit non-zero on warnings, not just errors.

**Examples:**

```bash
nodetool validate <workflow_id>
nodetool validate workflow.json
nodetool validate workflow.ts --json
nodetool validate <workflow_id> --warnings-as-errors
```

A clean graph prints a one-line verdict and exits `0`:

```
✅ Workflow is valid — 3 node(s), 2 edge(s).
```

A broken one names the node and the rule it broke, then exits `1`:

```
❌ Workflow has 1 error(s).

  error Unknown node type "nodetool.text.NoSuchNode" (not in the registry; Python-only nodes are not validated statically) [nodetool.text.NoSuchNode 1] (unknown_node)

  Codes:
    unknown_node — node type is not in the registry
```

### `nodetool debug <workflow_id_or_file>`

Run a workflow end to end and collect everything it emitted into a
self-contained bundle — every message, log line, node input/output, and error —
then print a verdict. Reach for it when `validate` passes but the run still does
the wrong thing.

The headless server run is on by default. The expensive surfaces are opt-in:
`--browser` starts Playwright and Chromium, `--trace` adds OpenTelemetry
spans, and `--stages` screenshots the canvas at each run stage.

**Options:**

- `--no-server` — skip the headless server surface.
- `--browser` — also run the workflow in a real browser (Playwright).
- `--trace` — capture an OpenTelemetry trace of the server run (timing, tokens, cost).
- `--stages` — screenshot the canvas at every browser run stage (implies `--browser`).
- `--params <json>` — JSON params keyed by input-node name.
- `--out <dir>` — bundle output directory (default `nodetool-debug/<id>-<timestamp>`).
- `--timeout <ms>` — per-surface run timeout.
- `--json` — print the full `DebugReport` as JSON to stdout.
- `--watch` — re-run on file change and print a diff of the verdict (file targets only).
- `--supervise` and its four bounds — see [Supervised runs](#supervised-runs) above.

**Examples:**

```bash
# Server surface only
nodetool debug <workflow_id>
nodetool debug workflow.json --params '{"prompt":"hi"}'

# Opt into the expensive surfaces
nodetool debug <workflow_id> --trace
nodetool debug <workflow_id> --browser --stages

# Tight edit→verify loop on a file target
nodetool debug workflow.json --watch
```

The bundle holds `report.json` and `report.md`, the resolved `workflow.json`,
and `server/messages.jsonl`. `--trace` adds `server/trace.jsonl`; `--browser`
adds `browser/record.json`, a canvas screenshot, and `browser/console-errors.log`.

### `nodetool node run <node_type>`

Instantiate one node, hand it a property bag, and print what it emits — no
workflow, no graph. Use it when `debug` says a run went wrong and you want to
know whether one node is the reason.

**Options:**

- `--props <json>` — JSON object of property values keyed by `@prop` name (default `{}`).
- `--no-secrets` — skip secret and asset resolution, so the run touches no database.
- `--json` — print the full run result as JSON.

**Examples:**

```bash
nodetool node run nodetool.text.Concat --props '{"a":"hi ","b":"there"}'
nodetool node run nodetool.text.Concat --props '{"a":"hi ","b":"there"}' --no-secrets
nodetool node run nodetool.text.Concat --props '{"a":"hi ","b":"there"}' --json
```

The verdict names the node type, its title, and how long it took, then lists
every record it emitted:

```
✅ nodetool.text.Concat (Concat) — 0ms

Emitted 1 record(s):
  {"output":"hi there"}
```

## Mini App Management

### `nodetool apps`

Move mini apps between installs. Reads and writes the local database directly — no running server.

**Subcommands:** `list`, `export-bundle`, `import-bundle`

```bash
# List applications with their operation count
nodetool apps list
nodetool apps list --json
```

`list` prints `id`, `name`, `operations`, and `updated_at`.

#### `nodetool apps export-bundle <application_id>`

Export an application as a portable bundle: the app document plus the full graph of every workflow its operations bind,
in a single JSON file. Inside the file an operation's `workflowId` is a bundle-local key, not a real workflow id.

**Options:**

- `-o, --output <file>` — output path (default `<name>.app.json`, with unsafe characters replaced by `_`).
- `--released` — export the released snapshot and the graphs it pinned, not the draft. Fails when the app has no
  released version.

The bundle path goes to stdout and the summary line to stderr, so `$(nodetool apps export-bundle <id>)` captures the
path alone. An operation binding a workflow that no longer exists is left unresolved in the bundle and reported as a
warning.

```bash
nodetool apps export-bundle <application_id>
nodetool apps export-bundle <application_id> -o my.app.json --released
```

#### `nodetool apps import-bundle <bundle_file>`

Import an application bundle into the local library: create its workflows and the app, with operations rewired to the
new ids.

**Options:**

- `--project <id>` — project to create the app in (default `default`).
- `--json` — output the created application as JSON.

A bundled workflow carrying a `sourceId` gets a row id derived from it, so importing two bundles that ship the same
workflow — two example apps binding one template — reuses the existing row instead of duplicating it. Without a
`sourceId` every import creates fresh workflows.

```bash
nodetool apps import-bundle my.app.json
nodetool apps import-bundle my.app.json --project my-project --json
```

### `nodetool app`

Where `nodetool apps` moves finished apps around, `nodetool app` runs one and
builds one. Both subcommands are headless — no browser, no editor — and both
write a debug bundle under `nodetool-debug/`.

#### `nodetool app debug <application_id_or_file>`

Run a mini app the way the web runtime would: validate every widget binding
against the workflows it binds, seed input defaults, apply params, replay a
scripted interaction sequence, execute the workflows on the kernel, fold the
streamed messages into the app's reactive values, and report what each widget
ends up showing.

The target is an application id (read from the applications table), an
`ApplicationBundle` JSON file (self-contained — operations reference bundle
keys, so it runs without a database), or a workflow id/file carrying a legacy
`app_doc`.

**Options:**

- `--params <json>` — reactive values applied before interactions, keyed by input
  name. A `resource:<binding id>` key seeds that collection with an array of items.
- `--interact <json>` — scripted steps: `set`, `change`, `click`, `run` (by
  operation id), `cancel`, `seedResource`.
- `--no-run` — static wiring check only; never execute a workflow.
- `--out <dir>` — bundle directory (default `nodetool-debug/app-<id>-<timestamp>`).
- `--timeout <ms>` — per-run timeout.
- `--json` — print the full `AppDebugReport` to stdout.

**Examples:**

```bash
# Static wiring check — no provider calls, no workflow execution
nodetool app debug my.app.json --no-run

nodetool app debug <application_id> --params '{"prompt":"hi"}'
nodetool app debug <application_id> --interact \
  '[{"set":{"key":"prompt","value":"hi"}},{"run":"draft"}]'
```

The verdict catches what a workflow-only run cannot: a widget bound to a token
the workflow has no input, output, node, or variable for, one naming an
operation the document never declares, an unknown widget type, a display widget
that never received a value, an app no interaction ever ran, an operation that
overran its timeout, and a click or change on a widget its own `visibleWhen` /
`disabledWhen` hides or disables — that step fails and names the condition.
Every declared operation runs, not just the first, and state is keyed per
operation.

The report lists what it did not simulate under `notSimulated`: layout, styling,
focus, and scroll, since nothing renders a DOM; the stored resource collections,
since a run reads the seeded in-memory provider rather than the database; and
reactive subgraph runs, where the browser reruns one input's downstream subgraph
and the harness runs the whole workflow.

#### `nodetool app build <prompt_or_spec_file>`

Turn a prompt, or a hand-written `spec.json`, into a verified
`ApplicationBundle`. Six stages run in order: **spec** pins what the app must
do, **plan** builds one workflow per operation, **author** places and wires the
widgets through the real `ui_app_*` tool contract, **check** validates the
wiring, **run** replays every interaction on the kernel, and **judge** asks a
model whether each interaction achieved what was asked. Everything still wrong
at the end of a pass becomes one complaint, and the next round edits the
document rather than rebuilding it.

Plan, author, and judge each call a model, and run executes real workflows, so a
build spends money and takes minutes.

**Options:**

- `-p, --provider <name>` / `-m, --model <id>` — the builder's provider and model.
- `--judge-model <provider/model>` — model that judges each interaction (env
  `NODETOOL_APP_JUDGE_MODEL`). Defaults to a configured model other than the
  builder's, because a model grading its own work is the weakest reviewer available.
- `--workflow <id>` — pin an existing workflow instead of planning one
  (repeatable, in operation order).
- `--max-repairs <n>` — repair rounds after the first pass (default `3`).
- `--cost-cap <usd>` — ceiling on build spend (default `2`).
- `--timeout <ms>` — wall clock for the whole build (default `600000`).
- `--out <dir>` — bundle directory (default `nodetool-debug/app-build-<slug>-<timestamp>`).
- `--json` — print the full `BuildReport` to stdout.
- `--no-judge` — skip the judge stage. The verdict's `notSimulated` then says
  nothing scored the app.
- `--watch` — re-build on spec-file change and print a diff of the verdict
  (spec-file targets only). Every save spends money.
- `--supervise`, `--max-decisions <n>`, `--max-retries <n>`,
  `--supervisor-cost-cap <usd>`, `--supervisor-model <provider/model>` — the
  same flags described under [Supervised runs](#supervised-runs). They apply to
  the Run stage, whose interactions execute on the kernel; `buildApp` itself is
  never supervised.

**Examples:**

```bash
nodetool app build "an app that drafts a note from a prompt" \
  -p anthropic -m claude-sonnet-5

nodetool app build spec.json -p openai -m gpt-5.4-mini --json

# Bind an existing workflow instead of planning one
nodetool app build "..." -p anthropic -m claude-sonnet-5 --workflow <id>

# Structural check only, one repair round, tight cap
nodetool app build spec.json -p anthropic -m claude-sonnet-5 \
  --no-judge --max-repairs 1 --cost-cap 1.00
```

The bundle holds `report.json`, `report.md`, `spec.json`,
`interactions/<name>/run-N.messages.jsonl` per replayed run, and — only for a
green build — `app.bundle.json`, the deliverable. The loop fails closed: an
exhausted budget, an issue that reappears after being fixed, or a cancelled
signal ends the build as failed with the reason named, and there is no bundle
behind a failed verdict. Exit code is `0` only when `verdict.ok`.

## Editor Documents

Timelines, sketches, and JS scripts each get the same three commands:
`validate` checks the document without rendering or running it, `debug` replays
a scripted edit session against it, and `versions` reads and writes its snapshot
history. All of them take a JSON file or a row id — a path that exists on disk
wins over an id, and file targets need no database.

### `nodetool timeline`

**Subcommands:** `validate`, `debug`, `versions`

#### `nodetool timeline validate <timeline_id_or_file>`

Check a timeline sequence without rendering it: clips on tracks the document
does not have, fields a schema round trip would strip, animation presets that
do not exist, and timings nothing can render. The target is a timeline JSON
file — a bare `TimelineDocument` or anything carrying one under `document`, so
a `timeline.get` response works as-is — or a `timeline_sequences` row id.

**Options:**

- `--json` — print the full `TimelineValidation` as JSON.
- `--warnings-as-errors` — exit non-zero on warnings, not just errors.

```bash
nodetool timeline validate sequence.json
nodetool timeline validate <timeline_id> --json
nodetool timeline validate <timeline_id> --warnings-as-errors
```

```
✅ 0 error(s), 0 warning(s)
```

#### `nodetool timeline debug <timeline_id_or_file>`

Run the same check, then execute each scripted step against the headless
`ui_timeline_*` bridge and validate the document the session left behind. A
step names a tool with or without the `ui_timeline_` prefix. A failing step is
recorded and the script continues, so one bad target does not hide everything
after it. Rendering, playback, decode, and generation are not simulated; the
report lists that under `notSimulated`.

**Options:**

- `--interact <json>` — the scripted steps, e.g. `[{"tool":"add_track","input":{"type":"audio"}}]`.
- `--out <dir>` — bundle output directory (default `nodetool-debug/timeline-<id>-<timestamp>`).
- `--json` — print the full `TimelineDebugReport` as JSON to stdout.

```bash
nodetool timeline debug sequence.json \
  --interact '[{"tool":"add_track","input":{"type":"audio","name":"Music"}}]'
```

```
✓ ui_timeline_add_track

✅ Timeline is sound — 1 interaction(s) ran clean.
  timeline: 2 track(s), 1 clip(s), 4000ms @ 30fps
  session:  1 step(s), 0 failed
```

The bundle holds `report.json`, `report.md`, and `timeline.json` (the input
document). The command exits `0` only when the verdict is ok.

#### `nodetool timeline versions`

Read and write a sequence's snapshot history against the local database:
manual saves, the autosaves `timeline.update` writes at most every five
minutes, and the pre-restore snapshot that makes a restore undoable.

**Subcommands:** `list`, `show`, `create`, `restore`, `delete`. All five take `--json`.

- `list <timeline_id>` — newest first; `--save-type <manual|autosave|restore>`, `--limit <n>` (default 100).
- `show <timeline_id> <version>` — one version's metadata and the document it stored.
- `create <timeline_id>` — snapshot the sequence as it stands now; `--name <name>` labels it.
- `restore <timeline_id> <version>` — snapshot the current state first, write the old document back, then re-validate it.
- `delete <timeline_id> <version>` — `-y, --yes` skips the confirmation prompt.

```bash
nodetool timeline versions list <timeline_id> --save-type manual --limit 10
nodetool timeline versions show <timeline_id> 3 --json
nodetool timeline versions create <timeline_id> --name "before the recut"
nodetool timeline versions restore <timeline_id> 3
nodetool timeline versions delete <timeline_id> 3 --yes
```

An old document is restored against today's schema, so what it used to pass is
not what it passes now: a restore whose document no longer validates prints the
issues and exits non-zero.

### `nodetool sketch`

**Subcommands:** `validate`, `debug`, `versions`

#### `nodetool sketch validate <sketch_id_or_file>`

Check a sketch (image document) without opening an editor: a duplicate layer
id, an `activeLayerId` or binding pointing at a layer the document lacks,
opacity or a blend mode no compositor ships, a binding with no workflow or
prompt behind it, and fields a schema round trip would strip. The target is a
`{sketch, layerBindings}` JSON file — or anything carrying one, so a
`sketch.get` response works as-is — or an `image_documents` row id. Layer
bitmaps stay opaque to the check.

**Options:**

- `--json` — print the full `SketchValidation` as JSON.
- `--warnings-as-errors` — exit non-zero on warnings, not just errors.

```bash
nodetool sketch validate sketch.json
nodetool sketch validate <image_document_id> --json
```

#### `nodetool sketch debug <sketch_id_or_file>`

Run the same check, then execute each scripted step against the headless
`ui_sketch_*` bridge (the prefix is optional) and validate the document the
session left behind. Pixels, painting, rendering, generation, and asset I/O are
not simulated; the report lists that under `notSimulated`.

**Options:**

- `--interact <json>` — the scripted steps, e.g. `[{"tool":"add_layer","input":{"name":"Glow"}}]`.
- `--out <dir>` — bundle output directory (default `nodetool-debug/sketch-<id>-<timestamp>`).
- `--json` — print the full `SketchDebugReport` as JSON to stdout.

```bash
nodetool sketch debug sketch.json \
  --interact '[{"tool":"add_layer","input":{"name":"Shadow"}},
               {"tool":"set_layer_props","input":{"target":"Shadow","opacity":0.4,"blendMode":"multiply"}}]'
```

```
✓ ui_sketch_add_layer
✓ ui_sketch_set_layer_props

✅ Sketch is sound — 2 interaction(s) ran clean.
  sketch:  2 layer(s), 0 binding(s), 1024x768
  session: 2 step(s), 0 failed
```

The bundle holds `report.json`, `report.md`, and `sketch.json`.

#### `nodetool sketch versions`

The same five subcommands as `timeline versions`, against an image document's
history. The per-layer generation takes in the editor are a different thing:
those record one generated image on one layer, these snapshot the whole
document.

```bash
nodetool sketch versions list <image_document_id> --save-type manual --limit 10
nodetool sketch versions show <image_document_id> 3 --json
nodetool sketch versions create <image_document_id> --name "before the repaint"
nodetool sketch versions restore <image_document_id> 3
nodetool sketch versions delete <image_document_id> 3 --yes
```

### `nodetool jsscript`

A JS script is a named, versioned script document: a body plus declared ports,
sandbox packages, secrets, a timeout, and saved test cases. The target of every
subcommand is a script JSON file (a bare `JsScriptDocument` or anything carrying
one under `document`) or a `js_scripts` row id.

**Subcommands:** `validate`, `run`, `test`, `debug`, `versions`

#### `nodetool jsscript validate <script_id_or_file>`

Check the body's syntax, its imports against the installed pack catalog,
undefined names, undeclared `inputs.*` reads, outputs no `emit`/`output` call
reaches, duplicate or non-identifier port names, and tests naming ports the
script does not declare. A body that declares outputs and returns them instead
of emitting them is an error — a script has no legacy return contract. Zero
saved tests, and a declared secret this install lacks, are warnings.

**Options:**

- `--json` — print the full `JsScriptValidation` as JSON.
- `--warnings-as-errors` — exit non-zero on warnings, not just errors.

```bash
nodetool jsscript validate script.json
nodetool jsscript validate <js_script_id> --warnings-as-errors
```

#### `nodetool jsscript run <script_id_or_file>`

Execute the body once in the QuickJS sandbox and print its outputs, streamed
emits, logs, and error. A body that reads its inputs with `stream` is fed with
`--input-streams` instead of `--inputs`; a staged handle the script does not
declare is refused.

**Options:**

- `--inputs <json>` — input values, e.g. `'{"a":1}'`.
- `--input-streams <json>` — items staged per handle, e.g. `'{"nums":[1,2,3]}'`.
- `--json` — print the run result as JSON.

```bash
nodetool jsscript run script.json --inputs '{"numbers":[1,2,3]}'
nodetool jsscript run script.json --input-streams '{"numbers":[1,2,3]}'
```

```
✅ ran in 1032ms
  outputs:  {"total":6}
  streamed: [{"name":"running","value":1},{"name":"running","value":3},{"name":"running","value":6}]
```

#### `nodetool jsscript test <script_id_or_file>`

Run the document's own saved test cases and grade each one. Exits non-zero when
any case fails, which makes it the regression check after an edit.

**Options:**

- `--json` — print the grade report as JSON.

```bash
nodetool jsscript test script.json
nodetool jsscript test <js_script_id> --json
```

```
✅ 2 passed, 0 failed
  ✓ sums three numbers
  ✓ sums an empty list to zero
```

#### `nodetool jsscript debug <script_id_or_file>`

Replay each scripted step against the headless `ui_jsscript_*` bridge (the
prefix is optional) and validate the document the session left behind. The
editor, persistence of a debug session, and secret values are not simulated.

**Options:**

- `--interact <json>` — the scripted steps, e.g. `[{"tool":"set_code","input":{"code":"..."}}]`.
- `--out <dir>` — bundle output directory (default `nodetool-debug/jsscript-<id>-<timestamp>`).
- `--json` — print the full `JsScriptDebugReport` as JSON to stdout.

```bash
nodetool jsscript debug script.json \
  --interact '[{"tool":"set_code","input":{"code":"await output(\"n\", 1);"}}]'
```

#### `nodetool jsscript versions`

The same five subcommands as `timeline versions`, against a script's history.

```bash
nodetool jsscript versions list <js_script_id> --limit 10
nodetool jsscript versions create <js_script_id> --name "before the rewrite"
nodetool jsscript versions restore <js_script_id> 3
```

## Job Management

### `nodetool jobs`

Query job status and results. Reads the local database by default.

**Subcommands:** `list`, `get`

**Options:**

- `--api-url <url>` — query a remote server instead of the local database.
- `--workflow-id <id>` — filter by workflow ID (for `list`).
- `--limit <n>` — max results (default: `100`).
- `--json` — output as JSON.

**Examples:**

```bash
# List all jobs
nodetool jobs list

# Filter by workflow
nodetool jobs list --workflow-id workflow_abc123

# Get a specific job
nodetool jobs get <job_id>
```

## Asset Management

### `nodetool assets`

Manage uploaded files and workflow assets. Reads the local database by default.

**Subcommands:** `list`, `get`

**Options:**

- `--api-url <url>` — query a remote server instead of the local database.
- `--query <q>` — search query (for `list`).
- `--content-type <type>` — filter by content type (for `list`).
- `--limit <n>` — max results (default: `100`).
- `--json` — output as JSON.

**Examples:**

```bash
# List assets
nodetool assets list

# Search assets
nodetool assets list --query "landscape"

# Get a specific asset
nodetool assets get <asset_id>
```

## Storage Maintenance

### `nodetool storage migrate-keys`

Move asset objects under their owner's prefix, so an object's key is
`<userId>/<assetId>.<ext>` and the owner is the leading path segment — the
boundary a Supabase RLS policy or an S3 bucket policy can enforce on the object
itself.

Run it once when upgrading an S3 or Supabase install that still holds objects
written under the older flat layout. The local file backend needs no migration:
it falls back to the flat key on a miss.

**Options:**

- `--dry-run` — report what would move without writing anything.
- `--user-id <id>` — migrate only this user's objects.
- `--json` — output the report as JSON.

**Examples:**

```bash
# See what would move first
nodetool storage migrate-keys --dry-run

# Move them
nodetool storage migrate-keys

# One user, machine-readable
nodetool storage migrate-keys --user-id 1 --json
```

A dry run reports the tally and writes nothing:

```
scanned 0, would move 0, already migrated 0, absent 0, failed 0
Dry run — nothing was written. Re-run without --dry-run.
```

## Vector Collections

### `nodetool collections`

Manage the RAG vector-store collections behind semantic search. Runs in-process
against the default vector provider — sqlite-vec unless
`NODETOOL_VECTOR_PROVIDER` points elsewhere — so no server has to be running.

**Subcommands:** `list`, `get`, `create`, `delete`, `query`, `index`

**Options:**

- `--embedding-model <model>` / `--embedding-provider <provider>` — record the
  embedding model and provider on a new collection (for `create`).
- `-n, --n-results <n>` — number of matches to return (for `query`, default `10`).
- `-y, --yes` — skip the confirmation prompt (for `delete`).
- `--json` — output as JSON. Available on every subcommand.

**Examples:**

```bash
# Create a collection and record what embeds it
nodetool collections create my_docs --embedding-model text-embedding-3-small

# Chunk and index files, with the same splitter the server uses
nodetool collections index my_docs notes.md report.txt

# Semantic search
nodetool collections query my_docs "how does the runner cancel a job" -n 5

# Inspect and remove
nodetool collections list
nodetool collections get my_docs
nodetool collections delete my_docs --yes
```

Re-indexing the same file replaces its chunks rather than adding a second copy,
so an `index` run is safe to repeat after a document changes.

## Spend Tracking

### `nodetool costs`

Report what NodeTool has spent on LLM and provider calls. Every call writes a
row carrying its cost and token counts; these subcommands aggregate them
straight from the local database, so no server has to be running.

Reach for it to answer "what did that run cost" after the fact, or to find
which model is eating a budget.

**Subcommands:** `summary`, `list`, `by-provider`, `by-model`

**Options:**

- `--provider <name>` — filter by provider (for `list` and `by-model`).
- `--model <id>` — filter by model (for `list`).
- `--limit <n>` — max results (for `list`, default `50`).
- `--json` — output as JSON. Available on every subcommand.

**Examples:**

```bash
# Overall spend plus per-provider and per-model breakdowns
nodetool costs summary

# Recent calls, most recent first
nodetool costs list --limit 20
nodetool costs list --provider anthropic

# Grouped totals
nodetool costs by-provider
nodetool costs by-model --provider openai
```

`summary` prints the overall total and both breakdowns:

```
Overall
 key          │ value
──────────────┼─────────
 total_cost   │ $0.0000
 total_tokens │ 0
 calls        │ 0

By provider
(no results)

By model
(no results)
```

Supervised runs and `nodetool app build` write to the same ledger, tagged
`supervisor` and `app-build` in `node_type`, so `costs list` shows what the
harnesses spent alongside the workflow's own calls.

## Secrets Management

### `nodetool secrets`

Manage encrypted secrets stored in the local database with per-user encryption.

**Subcommands:** `list`, `store`, `get`

**Examples:**

```bash
# List stored secret keys
nodetool secrets list

# Store a secret (prompts for value)
nodetool secrets store OPENAI_API_KEY

# Retrieve a secret value
nodetool secrets get OPENAI_API_KEY
```

## Provider Sign-In

### `nodetool auth`

Sign in to providers that use an account instead of an API key. Today that is
Claude: `auth claude` runs the same OAuth flow the `claude` CLI does and writes
the tokens to the Claude Agent SDK's credential file
(`~/.claude/.credentials.json`), so a NodeTool login and a `claude login` are
interchangeable. The Claude Agent provider picks the file up with no further
configuration. No database and no server are involved.

Reach for it when you want to run agents on a Claude subscription rather than
store an `ANTHROPIC_API_KEY`.

**Subcommands:** `claude login`, `claude status`, `claude refresh`, `claude logout`

**Options:**

- `--console` — sign in with a Console (API-billed) account instead of a
  subscription (for `login`).
- `--manual` — skip the loopback listener and paste the code the browser shows.
  This is the flow for a headless or remote machine (for `login`).
- `--no-browser` — print the URL instead of opening a browser (for `login`).
- `--force` — refresh even when the current token is still valid (for `refresh`).
- `--json` — output as JSON. Available on `login`, `status`, and `refresh`.

**Examples:**

```bash
# Browser opens, loopback callback completes the flow
nodetool auth claude login

# Headless box: paste the code yourself
nodetool auth claude login --manual

# Check and refresh
nodetool auth claude status
nodetool auth claude refresh --force

nodetool auth claude logout
```

The same flow is available over HTTP at
`/api/oauth/claude/{start,complete,tokens,disconnect}` and as a sign-in card on
the **Models & Providers** settings page.

## Settings

### `nodetool settings show`

Display current settings from environment variables.

**Options:**

- `--json` — output as JSON.

**Example:**

```bash
nodetool settings show
nodetool settings show --json
```

## Model Management

### `nodetool models`

List models and providers. Queries local providers and caches by default; `--api-url` targets a remote server.

**Subcommands:**

- `list` — list all models (recommended + provider + HuggingFace cached).
- `providers` — list configured providers and their capabilities.
- `recommended` — list recommended models.
- `ollama` — list Ollama models.
- `huggingface` — list HuggingFace cached models (`--query`, `--type` to filter).
- `by-provider <provider>` — list models for a provider; `--kind` one of `llm`, `image`, `tts`, `asr`, `video`, `embedding` (default `llm`).

**Examples:**

```bash
nodetool models list
nodetool models providers
nodetool models ollama
nodetool models by-provider openai --kind image
```

### `nodetool models` — HuggingFace Hub and cache

Five subcommands search the Hub and manage the local HuggingFace cache. They
talk to the Hub's HTTP API and the cache on disk, so they need no running
NodeTool server. Reach for them when you want to find a repo id for a local
model node, or pull the weights before a workflow needs them.

- `hf-types` — print the nodetool HF model types, one per line, followed by a
  `Generic types (require --task):` block. The types in that block need a
  pipeline tag when you search them; the ones above it do not. `--json` prints
  `{types, generic}` instead.
- `list-hf <model_type>` — search the Hub for models matching a nodetool model
  type. `--task <task>` supplies the HF pipeline tag (required for the generic
  types); `--limit <n>` caps the results; `--json` prints the raw entries.
  Without `--task`, a generic type fails with
  `Model type 'hf.model' requires --task (e.g. 'text-to-image').`
- `list-hf-all` — search across every nodetool HF model type at once.
  `--limit <n>` caps the total; `--repo-only` drops file-level entries and keeps
  one row per repo.
- `hf-cache` — list the local cache with disk detail: repo id, path, type,
  whether the repo is fully downloaded, size on disk, pipeline tag.
  `--downloaded-only` keeps only complete repos; `--limit <n>` and `--json`
  behave as elsewhere. `huggingface` (above) reads the same cache but prints
  id/name/provider/type/repo_id and can search it (`--query`, `--type`) or
  target a remote server (`--api-url`); use `hf-cache` when you care about what
  is on disk and how big it is.
- `download-hf --repo-id <owner/name>` — download a repo into the local
  HuggingFace cache, printing progress to stderr. `--file-path <path>` fetches a
  single file instead of the whole repo; `-a, --allow-patterns <glob>` and
  `-i, --ignore-patterns <glob>` are repeatable globs that narrow the file set.
  Passing `--cache-dir <dir>` switches the download to the flat llama.cpp cache
  layout (`~/.cache/llama.cpp` on Linux, `~/Library/Caches/llama.cpp` on macOS)
  — it does **not** redirect the files into `<dir>`.

**Examples:**

```bash
# Which model types can be searched, and which need --task
nodetool models hf-types

# Search one type, then every type at once
nodetool models list-hf qwen3 --limit 5
nodetool models list-hf hf.text_to_image --task text-to-image --limit 5
nodetool models list-hf-all --repo-only --limit 20

# What is already on disk
nodetool models hf-cache --downloaded-only

# Pull weights ahead of a run — whole repo, then just the GGUF files
nodetool models download-hf --repo-id Qwen/Qwen3-0.6B
nodetool models download-hf --repo-id Qwen/Qwen3-0.6B-GGUF -a "*.gguf"
```

## Media Generation

### `nodetool generate <provider> <model> <prompt...>`

Generate an image from any registered provider straight to a file, with no
workflow in between. Use it to try a model, check that a provider's key resolves,
or produce one image from a script.

Provider and model names are matched leniently against the registry and the
provider's own model manifest, so `fal-ai` finds `fal_ai` and `flux-schnell`
finds `fal-ai/flux/schnell`. The API key comes from the secret store or the
environment; when it is missing the error names the variable to set.

**Options:**

- `-o, --output <path>` — output file or directory. A directory (or a path
  ending in a separator) keeps the generated name; a file path is used as the
  base name. Default is a `nodetool-<model>-<timestamp>.<ext>` file in the
  working directory.
- `--width <n>` / `--height <n>` / `--aspect-ratio <ratio>` — output size, e.g.
  `--aspect-ratio 16:9`.
- `--negative-prompt <text>` — what to avoid in the image.
- `--seed <n>` — random seed, for reproducible output.
- `-n, --num-images <n>` — number of images (default `1`). Extra images get a
  `-2`, `-3`, … suffix.
- `--steps <n>` / `--guidance <n>` — inference steps and guidance scale.
- `--image <path...>` — input image(s); switches to image-to-image.
- `--strength <n>` — image-to-image strength, with `--image`.
- `--list-models` — list the provider's image models and exit.
- `--json` — print the result as JSON.

**Examples:**

```bash
# Discover model ids for a provider
nodetool generate fal-ai --list-models

# Text to image
nodetool generate fal-ai flux-schnell "a red fox in snow" -o fox.png

# Four square variants into a directory
nodetool generate fal-ai flux-schnell "a logo" --aspect-ratio 1:1 -n 4 -o ./out/

# Image to image
nodetool generate fal-ai flux-dev "restyle this" --image in.png --strength 0.6
```

## MCP Integration

### `nodetool mcp`

Install, remove, or inspect the NodeTool MCP server configuration for AI coding assistants (Claude Code, Codex,
OpenCode).

**Subcommands:** `install`, `uninstall`, `status`, `serve`

**Examples:**

```bash
# Install for all detected assistants (default URL http://127.0.0.1:7777/mcp)
nodetool mcp install

# Install for Claude Code only, with a custom URL
nodetool mcp install --claude --url http://127.0.0.1:7777/mcp

# Show installation status
nodetool mcp status

# Remove from all assistants
nodetool mcp uninstall
```

HTTP MCP (`/mcp`) needs the API server (`nodetool serve`). `nodetool mcp serve`
is stdio and does not.

### What the MCP server exposes

Exactly two tools land on `/mcp` and on `nodetool mcp serve`:

- **`execute_code`** — the CodeAct action tool, built by the same
  `createChatCodeActSession` the in-app chat agent runs on, so the two surfaces cannot drift.
  Everything NodeTool can do is reached from inside an action: workflow building and debugging
  (`create_workflow`, `validate_workflow`, `debug_workflow`, `debug_app`, the `ui_*`
  graph editing tools), media generation (`generate_image`, `generate_video`, `generate_speech`,
  `transcribe_audio`, …), files (`read_file`, `write_file`, `edit_file`, `glob`, `grep`), web
  (`web_search`, `browser`, `http_request`), collections, documents, code execution, image
  critique, and thread memory — as `nodetool.<namespace>.<method>()`, as `tools.<name>()`, or
  found with `await nodetool.searchTools("query")`. Google Workspace tools appear only on
  deployments with a Google login.
- **`view_image`** — direct, because image content cannot ride a sandbox action's JSON
  observation envelope.

MCP has no system prompt. The guest contract (QuickJS, not Node; `nodetool.*`;
no `finish()`) is the server `instructions` string and the first lines of the
`execute_code` description. The rest of the description is the CodeAct catalog.
Two resources carry the machine-readable form: `nodetool://capabilities` (tools
and modules) and `nodetool://sandbox` (blocked globals, unavailable bridges,
worked examples). Prompts `sandbox-action` and `sandbox-asset` are complete
`execute_code` bodies.

The session needs a user to run as — its tools touch that user's secrets, assets, and files — so
`createMcpServer` refuses one that is not bound to a user (`nodetool mcp serve`, the local `/mcp`
mount, or an authenticated session). File tools read and write under a per-user workspace at
`<data-dir>/mcp-workspaces/<user-id>`, not the host filesystem.

## Agents

### `nodetool agent`

Run the agent loop from the command line, over the default toolbelt.

**Subcommands:** `run`, `diagnose`

```bash
# Run an agent with an objective
nodetool agent run -p anthropic -m claude-sonnet-5 --objective "Research AI trends"

# Or pipe the objective
echo "Research AI trends" | nodetool agent run -p anthropic -m claude-sonnet-5

# Bound the run
nodetool agent run -p openai -m gpt-5.4-mini -o "Summarize the README" \
  --max-steps 10 --max-iterations 8

# Aggregate a failed run into one report
nodetool agent diagnose <job_id>
```

See the [Agent CLI](agent-cli.md) reference for full details.

> The `nodetool db` group (`migrate`, `status`, `baseline`, `rollback`) is documented under
> [Database Migrations](#database-migrations) above.

## Development Tooling

### `nodetool affected [files...]`

Map changed files — or the git working tree — to the smallest set of workspaces
that must be rebuilt and tested: the workspace that owns each file plus its
downstream dependents, and a `build:packages` only when a package that loads
from `dist/` is in the set. It saves reaching for the full build after a
one-file change.

**Options:**

- `--base <ref>` — compare against a git ref instead of the working tree.
- `--json` — print the result as JSON.

**Examples:**

```bash
nodetool affected
nodetool affected --base main
nodetool affected packages/cli/src/nodetool.ts
nodetool affected --json
```

The output names each affected workspace and the commands to run:

```
1 affected workspace(s) from 1 changed file(s):
  changed   @nodetool-ai/cli

Suggested commands:
  npm run test --workspace=packages/cli
```

### `nodetool harness`

The machine-readable inventory behind harness-first engineering: every headless
harness in the repo, every product surface with the code paths it owns, and
which harnesses cover which surface. Shipping a new surface means adding it to
the registry with its harness — or with its debt written down.

**Subcommands:** `list`, `audit`, `gate`

#### `nodetool harness list`

List every harness and its capabilities. Takes `--json` to print the registry.

```bash
nodetool harness list
nodetool harness list --json
```

Each entry names the harness, its kind, what it covers, and how to invoke it:

```
  affected           meta      Changed-file → workspace mapping
                     nodetool affected [--base main] [json, no-db]

  packs-compile      static    Sandbox npm module compiler (bundle, scan, probe, cache) and the shipped bridge packs
                     nodetool packs compile [--json] [--force] [json, no-db]
```

#### `nodetool harness audit`

Audit surface coverage. A surface with no harness must carry a written gap note;
one without it fails the audit.

**Options:** `--json`, and `--strict` to exit non-zero while any gap remains.

```bash
nodetool harness audit
nodetool harness audit --strict
```

Covered surfaces list their harnesses; gaps print the note that justifies them:

```
  ok   sandbox-packages     packs-compile, validate
  GAP  electron-shell       Electron shell (windows, IPC, menus, auto-update)

Documented gaps:

  electron-shell: Covered by Jest unit tests only. A harness would boot the
  packaged shell headlessly (Playwright's Electron driver), assert the IPC
  surface, and reuse backend-smoke for the server half.
```

#### `nodetool harness gate [files...]`

Map a diff onto surfaces by path and run the selfcheck of every harness covering
a touched surface. The diff selects the checks, not the author. Harnesses that
need a target or a key are printed as manual work rather than silently skipped.

**Options:**

- `--base <ref>` — diff against a git ref instead of the working tree.
- `--all` — ignore the diff and run every selfcheck.
- `--expensive` — include the expensive selfchecks (bundle staging and friends).
- `--dry-run` — print the plan without running anything.
- `--json` — print the plan, and the results unless `--dry-run`.
- `--strict` — exit non-zero when the diff touches a surface no harness covers.

```bash
nodetool harness gate --base main
nodetool harness gate --dry-run packages/base-nodes/src/text.ts
nodetool harness gate --all --expensive
```

The plan names the surfaces the diff touched before it runs anything:

```
1 changed file(s) touch 1 surface(s):
  workflow-execution   (1 file(s))

Manual harnesses (need a target/key — run yourself):
  debug              nodetool debug <id|file> [--browser --trace --watch --supervise]

3 selfcheck(s) to run
```

### `nodetool packs compile`

Compile every npm-backed sandbox module of every installed pack. A pack can
declare a guest module by npm dependency name instead of authoring code
(`{"name": ".", "kind": "js", "npm": "js-yaml"}`); this builds it — esbuild
bundles the dependency with no externals, a scope-aware scan rejects free
references to globals the guest lacks, and a capability-free QuickJS probe
imports the bundle to prove it initializes. Results are cached by content
digest, never by version.

The server compiles during its own catalog refresh and Electron compiles after
an install, so reach for this to warm the cache or to diagnose one pack.

**Options:**

- `--json` — print the compile report as JSON.
- `--force` — recompile and re-probe even when the cache has an answer.
- `--pack-search-path <dir>` — search this `node_modules` root (repeatable).

```bash
nodetool packs compile
nodetool packs compile --json
nodetool packs compile --force
```

Each module reports its source dependency and bundled size:

```
  ok   @nodetool-ai/sandbox-markdown ← marked — 66101 bytes
  ok   @nodetool-ai/sandbox-yaml ← js-yaml — 103863 bytes

10 compiled, 0 skipped.
```

Everything that stops a module short of admission is a named skip, not an
error: `npm-module-builtin-import` (the dependency needs `node:*`),
`npm-module-unresolved`, `npm-module-too-large` (1 MB cap),
`npm-module-forbidden-global`, and `npm-module-probe-failed`.

### `nodetool eval <suite>`

Run one of the agent evaluation suites against a provider and model, and report
its metrics — success rate, expectation score, tool calls, duration, and cost.

**Suites:** `graph-planner`, `graph-e2e`, `code-gen`, `task-planner`, `subtask`,
`codeact`, `app-build`, `tool-loop`, `workflow-escalation`, `script-tools`,
`jsscript-tools`, `sketch-tools`, `timeline-tools`, `storyboard-tools`,
`model3d-tools`, `app-tools`, `thread-memory-tools`, `creative-pipeline`.

**Options** (the same on every suite):

- `-p, --provider <id>` — provider id (`anthropic`, `openai`, `claude_agent_sdk`, `ollama`, …).
- `-m, --model <id>` — model id for that provider.
- `--cases <ids>` — comma-separated case ids to run (default: all).
- `--list` — list the suite's cases and exit.
- `--json` — print the full report as JSON.
- `--out <path>` — write the JSON report to a file.
- `--max-retries <n>` — planner attempts per case (default 3).
- `--max-iterations <n>` — turn cap per case for the loop-style suites (default 12).
- `--timeout <ms>` — per-case execution timeout for the suites that run what they plan (default 300000).
- `--judge-model <provider/model>` — the model that judges outputs in the self-judging suites (`graph-e2e`, `app-build`). Defaults to the run's own provider and model, which grades its own work.
- `--min-success <rate>` — exit non-zero when the success rate falls below this threshold (0..1).
- `--no-find-model` — run without configured model providers, skipping the model-dependent cases.

**Examples:**

```bash
# See what a suite covers before spending on it — needs no provider
nodetool eval graph-planner --list

nodetool eval graph-planner -p anthropic -m claude-sonnet-5
nodetool eval timeline-tools -p openai -m gpt-5.4-mini --cases cut-and-trim,titles-with-motion
nodetool eval graph-e2e -p anthropic -m claude-sonnet-5 --timeout 600000
nodetool eval codeact -p anthropic -m claude-sonnet-5 --json --out report.json

# Gate a run in CI
nodetool eval sketch-tools -p ollama -m qwen-3.5:4b --min-success 0.8
```

`--list` prints each case id with what it checks:

```
summarize                Single LLM step with one wired input and one output
branch-both-paths        Conditional with both If branches wired
deterministic-over-llm   Pure string mechanics must not be solved with an LLM step
```

## Tips

- Use `--json` flags for machine-readable output suitable for scripting.
- Set `NODETOOL_API_URL` environment variable to avoid specifying `--api-url` on every command.
- Use `nodetool serve` to start the local backend server before running API commands.
- See [Environment Variables](configuration.md#environment-variables-index) for a complete list of configurable variables.

