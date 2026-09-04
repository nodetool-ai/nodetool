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

`--json` never expands a large binary output into the JSON text. An image,
audio, or video payload over 64 KiB is written to
`nodetool-output/<job_id>/payload-N.<ext>` and appears as
`{"$file": "…", "bytes": N, "mimeType": "…"}` in its place; the path is
reported on stderr. Image nodes emit raw RGBA as their in-flight format, so a
raw ref is PNG-encoded on the way out. `nodetool run` and `nodetool node run`
do the same, spilling into `nodetool-output/`.

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
- `--permission-mode <default|auto|plan>` — how tool calls are gated when the
  input is piped (see [Permission mode](#permission-mode)). Unset runs `auto`.
  The interactive TUI does not gate its belt, and says so if the flag is passed.
- `--cost-cap <usd>` — ceiling on provider spend for one turn; `0` lifts it.
  Default: the `NODETOOL_AGENT_TURN_COST_CAP_USD` setting.
- `--timeout <s>` — wall-clock bound on one turn, in seconds; `0` leaves it no
  time at all. Default: the `NODETOOL_AGENT_TURN_DEADLINE_MS` setting.

Both flags override two of the five `NODETOOL_AGENT_*` settings; the other
three — concurrency, total turns, unpriced-token ceiling — come from the
settings alone. The budget is one object per turn, shared by every loop the
turn starts, so a ceiling bounds the turn rather than each loop separately. A
turn a ceiling refuses prints the reason: `[stopped] turn budget of $5 reached`
piped, or a `Stopped:` line in the TUI. Unlike `--permission-mode`, these two
apply to the interactive session as well.

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

#### `nodetool workflows migrate-code-inputs`

A one-time repair for saved `nodetool.code.Code` bodies. A Code node's declared
inputs used to arrive as globals of their own name; they now arrive on one
`inputs` object, so a body written the old way throws a `ReferenceError` on its
first input read. This walks the saved workflows and rewrites `name` to
`inputs.name` for every name the node can read — its declared slots, its inline
dynamic properties, and any handle an edge feeds it.

The rewrite is done on the AST, so a name inside a string, a comment, an object
key, or a local binding is left alone. It is safe to re-run: a body already
reading `inputs.*` has nothing to rewrite.

**Options:**

- `--dry-run` — report what would change and write nothing.
- `--user-id <id>` — migrate this user's workflows instead of the local user's (`1`).
- `--json` — print the report as JSON rather than the per-node lines.

```bash
# See what would change first
nodetool workflows migrate-code-inputs --dry-run

# Then do it
nodetool workflows migrate-code-inputs
```

Each rewritten node prints one line naming the inputs it moved, followed by a
count:

```
4 Code node(s) in 3 workflow(s) were rewritten (11 scanned across 7 workflows).
```

A body that fails to parse is counted under a trailing `N failed.` line and left
untouched, so one bad node does not stop the pass.

### `nodetool validate <workflow_id_or_file>`

Check a workflow against the node registry **without running it**: unknown node
types, missing required properties, dangling or mis-typed edges, model
properties naming a provider or model id that does not exist,
and `nodetool.code.Code` bodies that never return or leave an output unset. On
a workflow-id target, where the secret store is reachable, it also warns about
declared credentials the install cannot resolve. It finishes in well under a
second, which makes it the cheap pre-flight before a run that costs money.

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

Every finding carries a stable `code`. An **error** is a document no reading of
which produces the scene its author described; a **warning** is a picture that
renders and is not the one that was written — usually because this build could
not read something a newer one wrote (forward compatibility), or because the
authored motion did not fit the clip.

| Code | Severity | What it caught |
|---|---|---|
| `schema_invalid` | error | The document does not parse; every structural check is skipped |
| `duplicate_id` | error | Two tracks, clips or markers share an id |
| `clip_track_missing` | error | A clip sits on a track the document does not declare |
| `negative_timing` | error | A clip or marker starts before the origin, or a clip lasts zero |
| `fade_exceeds_duration` | error | The in and out audio fades overlap |
| `in_out_points_invalid` | error | The source span is negative or empty |
| `speed_multiplier_invalid` | error | A non-positive playback rate |
| `unknown_animation_preset` | error | A preset this build does not ship; nothing animates |
| `custom_animation_invalid` | error | Baked curves the one gate refuses; re-bake from the script |
| `parent_cycle` | error | A `parentId` chain loops, so the group cannot be resolved |
| `matte_source_missing` | error | A `matte` names a clip the document lacks, or itself — the layer draws unmatted, showing everything the matte was hiding |
| `time_remap_not_monotonic` | error | `timeRemap` keyframe `t` repeats or goes backwards (`sourceMs` may descend — that is a reverse) |
| `field_stripped` | warning | A field the schema drops, lost on the next save |
| `in_out_duration_mismatch` | warning | Source span and timeline duration disagree at the clip's rate |
| `transition_exceeds_duration` | warning | The cut is longer than the clip carrying it |
| `unknown_transition` | warning | A transition `type` or `direction` this build cannot draw; it cross-fades left |
| `unknown_easing` | warning | An `easing` outside the grammar; it eases linearly |
| `unknown_effect` | warning | A clip effect type this build cannot apply; the layer draws ungraded |
| `mask_path_invalid` | warning | A mask `kind` or path `d` that cannot rasterize; the layer draws unmasked |
| `unknown_shape_kind` | warning | A `shapeStyle.kind` this build has no geometry for; the shape draws nothing |
| `font_not_portable` | warning | A font family NodeTool does not ship; every host resolves it against its own installed fonts, so the editor preview and the render can differ |
| `parent_missing`, `parent_not_group` | warning | A `parentId` naming nothing, or naming a clip that is not a group; the child renders unparented |
| `layer_cap_exceeded` | warning | More video clips overlap at an instant than the compositor draws |
| `animation_exceeds_clip` | warning | The window does not fit the clip after its delay, so the motion is clamped — or never runs |
| `stagger_compressed` | warning | The stagger span did not fit, so the per-unit offset was shrunk and the units overlap more than authored |
| `replace_curves_overlap` | warning | Two animations drive one absolute channel (`positionX/Y`, `anchorX/Y`, `trimStart/End`) at the same time; the last in document order wins and the other is discarded |
| `text_illegible` | warning | Type under 2.5% of frame height, or under a 3:1 contrast ratio against its own background plate or a full-frame shape clip behind it |
| `clips_overlap`, `clip_shorter_than_frame`, `caption_out_of_range`, `binding_incomplete`, `duplicate_track_index`, `transcript_clip_missing`, `link_partner_missing` | warning | Structural smells that still render |

`text_illegible` refuses to guess: a colour notation it cannot read, a
translucent plate, gradient-filled type, or a backdrop it cannot prove sits
behind the text ends the contrast check rather than producing a finding.

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
secrets, a timeout, and saved test cases. The target of every
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

#### `nodetool models recommended`

The curated shortlist — what to reach for when you want a model id that is known
to work, rather than everything a provider will sell you. It reads the shipped
`RECOMMENDED_MODELS` table in-process, so it needs no server, no API key, and no
network.

- `--category <category>` — one of `all` (default), `image`,
  `image-text-to-image`, `image-image-to-image`, `language`,
  `language-text-generation`, `language-embedding`, `asr`, `tts`,
  `video-text-to-video`, `video-image-to-video`. An unknown value exits `1`
  listing the valid ones.
- `--system <darwin|linux|windows>` — keep only models that run on that
  platform. A model that declares no platforms is kept for all of them.
- `--limit <n>` — cap the results. Applied after both filters; a value that is
  not a positive integer exits `1`.
- `--check-servers` — fetch the list from a running server instead, which also
  probes whether the local Ollama and llama.cpp servers can serve each entry.
  This is the only mode that uses `--api-url` (default `http://localhost:7777`,
  or `NODETOOL_API_URL`).
- `--json` — the full model records rather than the five-column table.

```bash
# The top of the curated list, no network
nodetool models recommended --limit 3

# What to embed with
nodetool models recommended --category language-embedding

# What a Mac can actually run, machine-readable
nodetool models recommended --system darwin --json

# Which of them a local Ollama has pulled
nodetool models recommended --check-servers
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
  critique, and memory — as `nodetool.<namespace>.<method>()`, by importing them, or
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

Run one CodeAct turn from the command line, over the default toolbelt. The
objective becomes the user message and the model acts by writing sandboxed
JavaScript — the same loop the chat runs. `create_plan` and `execute_plan` are
on the belt, so an objective that wants decomposing gets a task DAG and the
`planning_update` / `task_update` events stream with the rest of the trace.

**Subcommands:** `run`, `diagnose`

```bash
# Run an agent with an objective
nodetool agent run -p anthropic -m claude-sonnet-5 --objective "Research AI trends"

# Or pipe the objective
echo "Research AI trends" | nodetool agent run -p anthropic -m claude-sonnet-5

# Bound the tool-calling rounds
nodetool agent run -p openai -m gpt-5.4-mini -o "Summarize the README" \
  --max-iterations 8

# Ask before every write, execute or external call
nodetool agent run -p anthropic -m claude-sonnet-5 -o "Tidy the workflows" \
  --permission-mode default

# Bound what the run may spend and how long it may take
nodetool agent run -p openai -m gpt-5.4-mini -o "Research AI trends" \
  --cost-cap 0.50 --timeout 120

# Aggregate a failed run into one report
nodetool agent diagnose <job_id>
```

`--max-steps` is gone with the planner→compiler pipeline the command used to
run, along with plan approval, checkpoints, the planning/reasoning model split,
and skill auto-select. See [Agent CLI](agent-cli.md).

### Run budget

`--cost-cap <usd>` and `--timeout <s>` bound one run. They override two of the
five `NODETOOL_AGENT_*` settings a chat turn reads
(`NODETOOL_AGENT_TURN_COST_CAP_USD`, `NODETOOL_AGENT_TURN_DEADLINE_MS`); the
other three — `NODETOOL_AGENT_MAX_CONCURRENCY`, `NODETOOL_AGENT_MAX_TURNS`,
`NODETOOL_AGENT_UNPRICED_TOKEN_CEILING` — come from the settings alone.
`--cost-cap 0` lifts the dollar cap, which is what a local-only install wants;
`--timeout 0` leaves the run no time and stops it before its first model turn.

One budget covers the whole run, not each loop: a sub-agent, an `execute_plan`
DAG, and an `AgentNode` reached through `run_node` all reserve against it. A
cap is *admission*, so a turn whose worst case would cross it is refused before
the call rather than noticed after the money is spent — a model the price
catalog does not cover has no worst case and is admitted against a prompt-token
ceiling instead, never as free.

A run a ceiling stops prints the reason and exits non-zero:

```
agent stopped: turn budget of $0.01 reached
```

With `--json` the same reason arrives as an `error` event. Every run ends with
what it committed against the cap, as `spent $0.0123` on stderr or a
`log_update` in `--json`.

### Permission mode

Every tool call the model makes goes through one ladder, on every host. What a
mode decides:

| Mode | Read | Write, execute, external |
|---|---|---|
| `default` | runs | asks first |
| `auto` | runs | runs |
| `plan` | runs | blocked, with a message telling the model to switch out |

`--permission-mode` sets it on `nodetool agent run` and on `nodetool-chat`; an
unrecognized value is refused rather than falling back to a default.

**In a terminal**, `default` is what an unset flag means: each write, execute or
external call prints on stderr and waits for `y` (this call), `n` (refuse), or
`a` (this tool for the rest of the session). Stdout carries the run's result, so
nothing about the prompt goes there.

**Behind a pipe**, nobody is there to answer, so the run takes the headless gate:
`auto`, printing once up front that escalated calls are denied. An explicit mode
still applies — a piped `--permission-mode plan` blocks what plan mode blocks —
but the answer to anything the ladder escalates is `deny`, never a silent allow.

See the [Agent CLI](agent-cli.md) reference for full details.

> The `nodetool db` group (`migrate`, `status`, `baseline`, `rollback`) is documented under
> [Database Migrations](#database-migrations) above.

## Deployment and Workers

Two different things, and the CLI keeps them apart. A **server** is long-lived
and people connect in to it — `nodetool deploy` manages one over Docker. A
**worker** is a rented GPU that a NodeTool instance connects out to, bills by
the minute, and is meant to be torn down — `nodetool worker` provisions it. See
[Deployment](deployment.md) for which one you want.

### `nodetool deploy`

Manage a Docker self-host server target described by a `deployment.yaml`.
`init` scaffolds the file, `add` fills in one target, and every other
subcommand names that target.

The file lives in the user config directory, not the working directory:
`~/Library/Application Support/nodetool/deployment.yaml` on macOS,
`%APPDATA%\nodetool\deployment.yaml` on Windows, and
`$XDG_CONFIG_HOME/nodetool/deployment.yaml` — falling back to
`~/.config/nodetool/` — elsewhere. Run `nodetool deploy edit` to open it rather
than guessing the path.

**Subcommands:** `init`, `add`, `edit`, `list`, `show`, `plan`, `apply`,
`status`, `logs`, `destroy`, plus the remote groups `workflows`, `database`,
`collections` and the `users-*` verbs below.

**Options:**

- `--dry-run` — print what `apply` would do without executing it.
- `-f, --follow` / `--tail <n>` / `--service <service>` — for `logs`; `--tail`
  defaults to `100`.
- `--force` — skip the `destroy` confirmation.
- `--json` — machine-readable `list` output.

```bash
# Scaffold, describe, and review before touching the remote host
nodetool deploy init
nodetool deploy add my-server --type docker
nodetool deploy plan my-server

# Deploy and watch it
nodetool deploy apply my-server
nodetool deploy logs my-server --follow --tail 200

# Open deployment.yaml in $EDITOR
nodetool deploy edit
```

`list` and `show` answer the two questions you have before naming a target in
any of the other verbs, and they are the pair to reach for when you have
inherited a `deployment.yaml` you did not write.

`list` queries each configured target for its live state and prints one row per
deployment — `name`, `type`, `status`, `last_deployed`, `host`, `container`,
`pod_id`, `project`, `region`, `service`. With none configured it prints
`(no deployments configured)`; `--json` gives the same rows for a script.
`show <name>` reads the file only, printing that one target's config as YAML —
no remote call, so it works while the host is down.

```bash
nodetool deploy list
nodetool deploy list --json
nodetool deploy show my-server
```

Both need the file to exist. Without it they exit non-zero with
`Deployment configuration not found at <path>. Run 'nodetool deploy init' to
create it.`

The full server walkthrough is [Deployment](deployment.md) and
[Self-Hosted Deployment](self-hosted-deployment.md).

#### Remote workflows, rows, and collections

Once a target is up, three groups act on it over the admin API rather than on
the local database:

```bash
# Push a local workflow and everything it references, then run it there
nodetool deploy workflows sync my-server <workflow_id>
nodetool deploy workflows list my-server
nodetool deploy workflows run my-server <workflow_id> -p prompt="a red fox"
nodetool deploy workflows delete my-server <workflow_id>

# Read, upsert, and delete a single remote DB row
nodetool deploy database get my-server users alice
nodetool deploy database save my-server users '{"id":"alice","role":"admin"}'
nodetool deploy database delete my-server users alice

# Push a local RAG collection to the deployment
nodetool deploy collections sync my-server my_docs
```

`workflows run` takes `-p, --param <k=v>`, repeatable. `<table>` is passed
through to the deployment, which resolves it against its own adapters — the
valid names are the remote server's tables, not a list this CLI holds. `save`
takes the row as a positional JSON string, and `get` on a row that is not there
answers `404`. `collections sync` uploads in batches of `--batch-size`,
default `100`.

#### API users on the deployment

For a multi-user server, mint and rotate the tokens its API clients
authenticate with. `--role` is `user` unless you pass `admin`.

```bash
nodetool deploy users-add my-server alice --role admin
nodetool deploy users-list my-server
nodetool deploy users-reset-token my-server alice
nodetool deploy users-remove my-server alice
```

Every subcommand that touches a live deployment — the `users-*` verbs and the
three remote groups above — sends an admin bearer token. `--token <token>`
passes it explicitly and wins over `NODETOOL_ADMIN_TOKEN`; with neither, an
interactive shell prompts and a non-interactive one exits `1`.

### `nodetool worker`

Provision, attach to, and tear down a rented GPU worker on RunPod or Vast. A
worker bills by the minute, so `stop` is part of the workflow, not cleanup you
get to postpone.

**Subcommands:** `profile` (`add`, `list`, `rm`), `create`, `list`, `status`,
`token`, `stop`, `models`

**Options:**

- `--target <runpod|vast>`, `--image <image>`, `--gpu <gpu>`, `--vcpu <n>` —
  what to rent, on `profile add` or inline on `create`.
- `--idle-timeout <minutes>` / `--max-lifetime <minutes>` — auto-stop when idle,
  and a hard TTL. Both are the guard against a forgotten worker.
- `--token-policy <generate|fixed>` — default `generate`.
- `--profile <name>` / `--attach` — for `create`.
- `--all` — for `stop`, stops every non-stopped worker.
- `--json` — for `list`.

```bash
# Save a preset once, then rent from it
nodetool worker profile add hf-a40 --target runpod \
  --image ghcr.io/nodetool-ai/nodetool-worker:latest \
  --gpu "NVIDIA A40" --idle-timeout 15
nodetool worker create --profile hf-a40 --attach

# Inspect and tear down
nodetool worker list
nodetool worker status <instance-id>
nodetool worker stop --all
```

`token <id>` prints one worker's bearer token and nothing else — no table, no
label — so it pipes into the variable the bridge reads:

```bash
export NODETOOL_WORKER_TOKEN=$(nodetool worker token <instance-id>)
```

`list` withholds tokens on purpose; this is the one command that decrypts one,
and only for the worker you name. Reach for it when a second shell, a CI step,
or a `--api-url` client has to talk to a worker `--attach` did not configure. A
worker that carries no token is an error rather than empty output:
`Worker instance '<id>' has no token (open worker).`

The full walkthrough, including what `--attach` changes locally, is
[Worker Deployment](worker-deployment.md).

#### `nodetool worker models`

Manage the HuggingFace cache on the worker itself, over the WebSocket bridge —
no NodeTool server has to be running. Pre-pulling weights here is what keeps the
first run of a graph from paying the download on rented GPU time.

The `[worker-id]` argument is optional: omit it and the command uses the
currently attached worker, or errors telling you to attach one.

**Options:**

- `--repo-id <id>` — HuggingFace repo, `owner/name`. Required for `download`
  and `delete`.
- `--file-path <path>` — download a single file instead of the repo.
- `-a, --allow-patterns <pattern>` / `-i, --ignore-patterns <pattern>` — glob
  filters on `download`, both repeatable.
- `--json` — for `list`.

```bash
# What is already cached on the attached worker
nodetool worker models list

# Pull weights ahead of a run — whole repo, then just the safetensors
nodetool worker models download --repo-id stabilityai/sdxl-turbo
nodetool worker models download --repo-id stabilityai/sdxl-turbo -a "*.safetensors"

# Reclaim disk on a named worker
nodetool worker models delete <worker-id> --repo-id stabilityai/sdxl-turbo
```

## Messaging Bridges

### `nodetool telegram`

Run the Telegram bridge: it turns private-chat messages into turns on the agent
loop of a running NodeTool server, and streams the answers back. The bridge
holds no conversation state and no user credentials — the agent loop, tools,
permissions, threads, and cost tracking all stay on the server, which the
bridge reaches over `/ws` as the linked user.

Reach for it when you want NodeTool answering from a phone without opening the
web UI. The server it talks to must have `NODETOOL_INTEGRATION_TOKEN` set, or
the linking routes the bridge calls do not exist.

**Subcommands:** `serve`, `register-commands`

**Options:**

- `--config <path>` — path to `telegram-bot.json`, relative to the working
  directory. Both subcommands take it. Without the flag, `telegram-bot.json` is
  read if it is there and skipped if it is not; a path you asked for explicitly
  and that does not exist is an error.

Configuration is environment variables plus that optional file. The env vars are
listed in the
[Environment Variables Index](configuration.md#environment-variables-index);
the file carries only the tuning knobs:

```jsonc
// telegram-bot.json
{
  "allowUsers": [],       // Telegram user ids allowed to link; empty = anyone
  "editThrottleMs": 1500, // minimum gap between edits of one streamed reply
  "maxQueuedTurns": 3     // messages queued behind an in-flight turn
}
```

```bash
# Publish the bot's command list — a deploy step, not a boot step
export TELEGRAM_BOT_TOKEN=123456:AA...
export NODETOOL_INTEGRATION_TOKEN=the-same-value-the-server-has
nodetool telegram register-commands

# Long-poll the Bot API and serve turns
nodetool telegram serve --config ./telegram-bot.json
```

Both subcommands validate the whole configuration before doing anything and
print the fields that failed rather than a stack trace:

```
Invalid Telegram bridge environment:
  TELEGRAM_BOT_TOKEN: TELEGRAM_BOT_TOKEN is required
  NODETOOL_INTEGRATION_TOKEN: NODETOOL_INTEGRATION_TOKEN is required
```

`serve` polls with `getUpdates`. Webhook mode is not implemented yet, and
setting `TELEGRAM_WEBHOOK_URL` makes `serve` refuse to start rather than
silently polling. Design notes: [telegram-bot-design.md](telegram-bot-design.md).

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

**Subcommands:** `list`, `audit`, `capabilities`, `gate`

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

#### `nodetool harness capabilities`

The same invariant one rung down, over the agent capabilities rather than the
product surfaces: every exported capability must name the checked-in suites that
exercise it, the eval cases that drive a model through it, or a written gap note.
Reach for it after adding a capability — a new one with neither a check nor a
note fails here, and in `npm run capabilities:check`.

**Options:** `--json`, and `--strict` to exit non-zero while any gap remains.

```bash
nodetool harness capabilities
nodetool harness capabilities --strict
```

The header counts covered capabilities, then each gap prints the note that
justifies it:

```
Capability coverage: 216/224 covered, 8 gap(s)

  GAP  ui_get_graph                     ui
  GAP  get_apify_actor                  apify

Documented gaps:

  get_apify_actor: The Apify suites cover search, schema, run, abort, and the
  dataset reader; fetching one actor's record has no case. A read-only case
  against the recorded actor fixture would close it.
```

A trailing `Contract drift:` line means a capability's declared description,
schema, category, or `needsToolCallId` moved without its coverage mapping being
touched. Refresh the table with `npm run capabilities:sync` and say which case
covers the new contract.

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

### `nodetool package`

Manage TypeScript **node** packages — the packs that contribute node types to
the registry. Not to be confused with `nodetool packs`, which handles the
sandbox packs a Code node imports; the names are one letter apart and the
subjects are unrelated.

Reach for it when you are authoring a node pack: `init` scaffolds one, `list`
tells you what this install has, and the three `*-docs` commands generate the
Markdown that ships with a pack.

**Subcommands:** `list`, `init`, `docs`, `node-docs`, `workflow-docs`

#### `nodetool package list`

List the installed packages with their node counts, or the registry's catalog
with `--available`.

```bash
nodetool package list
nodetool package list --available
nodetool package list --json
```

```
 name          │ version     │ description         │ nodes
───────────────┼─────────────┼─────────────────────┼───────
 nodetool-base │ 0.6.3-rc.41 │ Nodetool Base nodes │ 0
```

`--available` reads the index at `NODETOOL_PACKAGE_REGISTRY_URL`. See
[Node Packs](node-packs.md) for what a pack is and how one is installed.

#### `nodetool package init`

Scaffold a new TypeScript node package in the current directory. Takes no
options — it prompts for what it needs.

```bash
mkdir nodetool-my-nodes && cd nodetool-my-nodes
nodetool package init
```

#### `nodetool package docs`, `node-docs`, `workflow-docs`

Generate Markdown from the current package: `docs` writes one overview,
`node-docs` writes a page per node, and `workflow-docs` documents the workflow
JSONs a pack ships. Each takes `-v, --verbose`.

**Options:**

- `docs` — `-o, --output-dir <dir>` (default `docs`), `-c, --compact` for a
  shorter overview.
- `node-docs` — `-o, --output-dir <dir>` (default `docs/nodes`),
  `-p, --package-name <name>` to emit only nodes under a namespace prefix.
- `workflow-docs` — `-o, --output-dir <dir>` (default `docs/workflows`),
  `-e, --examples-dir <dir>` to point at the workflow JSONs, and
  `-p, --package-name <name>` to keep only those whose `package_name` matches.

```bash
nodetool package docs --compact
nodetool package node-docs --package-name nodetool.text
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

### `nodetool reliability`

Run a reliability journey on more than one execution surface and diff each one
against the kernel oracle. A journey is a small workflow plus the invariants its
run must hold — lifecycle pairing, one terminal message, no leaked cleanup — and
the point is that the kernel runner and the WebSocket server must produce the
same stream for it. Reach for it when a change touches execution and you need to
know whether the surfaces still agree.

Journeys live in `reliability/journeys/`.

Working in the monorepo, run this one from the built CLI (`npm run nodetool --`)
rather than from source: the journey fixtures use decorators, and the
`dev:nodetool` transform rejects them with `Decorators are not valid here`.

**Subcommands:** `list`, `run`, `update-goldens`

#### `nodetool reliability list`

List the journeys, each with its surfaces and the invariants it asserts. Takes
`--json` for the full summaries.

```bash
nodetool reliability list
nodetool reliability list --json
```

```
linear-text-pipeline
  Journey #1 (docs/RELIABILITY_ARCHITECTURE.md §5): input -> transform -> output.
  The baseline — if this diverges across surfaces, everything is suspect.
  surfaces: kernel, ws-server
  invariants: lifecycle-pairing, terminal-uniqueness
```

#### `nodetool reliability run <journey>`

Run one journey on the surfaces it declares and diff every non-oracle surface
against the kernel oracle.

**Options:**

- `--surface <name>` — run only this surface, repeatable, overriding the
  journey's own list. The kernel oracle is always included.
- `--faults <name>` — inject this fault, repeatable, replacing the journey's
  declared fault matrix. The provider-seam faults are implemented
  (`provider-429`, `provider-500`, `provider-timeout`, `truncated-stream`,
  `malformed-sse`, `slow-drip`, `cost-omission`); the `ws`/`bridge`/`host`/
  `client` names parse but report as unimplemented.
- `--diff` — print the full per-channel stream diff for a diverging surface.
- `--json` — print the whole `CompareReport` instead of the summary.

```bash
nodetool reliability run linear-text-pipeline
nodetool reliability run linear-text-pipeline --surface kernel
nodetool reliability run mid-run-cancel-node --faults provider-429 --diff
```

#### `nodetool reliability update-goldens <journey>`

Rewrite a journey's `expected/` fixtures from a fresh unfaulted kernel run. For
a golden that legitimately moved — read the diff before committing it, since
this command cannot tell a fixed bug from a new one.

```bash
nodetool reliability update-goldens linear-text-pipeline
```

### `nodetool eval <suite>`

Run one of the agent evaluation suites against a provider and model, and report
its metrics — success rate, expectation score, tool calls, duration, and cost.

**Suites:** `graph-planner`, `graph-e2e`, `code-gen`, `task-planner`, `subtask`,
`codeact`, `app-build`, `tool-loop`, `workflow-escalation`, `script-tools`,
`jsscript-tools`, `sketch-tools`, `timeline-tools`, `storyboard-tools`,
`model3d-tools`, `app-tools`, `memory-tools`, `creative-pipeline`.

**Options** (the same on every suite):

- `-p, --provider <id>` — provider id (`anthropic`, `openai`, `claude_agent_sdk`, `ollama`, …).
- `-m, --model <id>` — model id for that provider.
- `--cases <ids>` — comma-separated case ids to run (default: all).
- `--list` — list the suite's cases and exit.
- `--json` — print the full report as JSON.
- `--out <path>` — write the JSON report to a file.
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

### `nodetool jtbd`

An eval suite scores a model. A job asks whether the *product* let the agent
finish something, and keeps the transcript so you can say what to change.

A job is one objective taken end to end across whatever surfaces it needs,
stated the way a user would state it, handed to the agent in the user's own
words, and graded on the world it left behind. No job names a tool — which tool
the agent reaches for, and in what order, is what is under test. The worlds are
the same headless bridges the `tool-loop` eval suites drive.

**Subcommands:** `list`, `run`, `optimize`.

```bash
# What the jobs are, before spending anything — needs no provider
nodetool jtbd list
nodetool jtbd list --json
```

Each entry prints the job id, its difficulty tier, the surfaces it crosses, the
statement, and the outcomes it grades:

```
storyboard-a-scene  [standard]  storyboard
  When I have a scene to shoot, I want it broken into shots with the action
  described, so I can see the coverage before I spend on renders.
  outcomes: five-shots, action-written, savable
```

#### `nodetool jtbd run`

Drives a model through the jobs and writes one bundle per job.

- `-p, --provider <id>` — provider id (`anthropic`, `openai`, `ollama`, …). Required.
- `-m, --model <id>` — model id for that provider. Required.
- `--jobs <ids>` — comma-separated job ids (default: all; see `list`).
- `--out <dir>` — bundle directory (default `nodetool-debug/jtbd`).
- `--max-iterations <n>` — turn cap per job, for jobs that declare none.
- `--min-achieved <rate>` — exit non-zero when the achievement rate falls below this threshold (0..1).
- `--no-find-model` — run without configured model providers.
- `--json` — print the full report as JSON.

```bash
nodetool jtbd run -p anthropic -m claude-sonnet-5
nodetool jtbd run --jobs workflow-from-prompt,timeline-assemble-cut -p openai -m gpt-5.4-mini

# Gate a run in CI
nodetool jtbd run -p anthropic -m claude-sonnet-5 --min-achieved 0.8
```

`run` writes `nodetool-debug/jtbd/<job>/` holding `report.json` (transcript,
tool calls, outcomes, friction) and `review.md`, the same run rendered for a
person to read. The transcript is the point: it records what the model was told
and what it said between calls, not only which tools fired.

Before any model reviews a run, a pure pass derives what the transcript decides
on its own, and each finding names an owner. A tool that errored repeatedly, or
answered the same call identically three times, is a `harness` finding — the
fix is a schema or an error string in NodeTool's own code. A run that called no
tool at all is a `prompt` finding. A run that took far more calls than the job
needs is `unattributed`, because whether that is a prompt failing to describe
the short path or a tool surface forcing the long one is the judgement a pure
pass cannot make.

#### `nodetool jtbd optimize`

Hands one recorded run — the system prompt verbatim, every assistant turn,
every call with its arguments and result — to a *different* model and asks what
one change would make the next run go better.

- `-p, --provider <id>` — reviewing provider; use a different one than ran the jobs.
- `-m, --model <id>` — reviewing model id.
- `--bundle <dir>` — bundle directory to review (default `nodetool-debug/jtbd`).
- `--all` — review clean runs too, not just failures and friction.
- `--json` — print the proposals as JSON.

```bash
nodetool jtbd optimize -p openai -m gpt-5.4-mini
nodetool jtbd optimize -p openai -m gpt-5.4-mini --all --bundle ./my-runs
```

A proposal must name a target and a change; "improve the prompt" is rejected by
the parser. Proposals land in `proposals.json` next to the run.

**It proposes; it never applies.** Nothing in the loop edits a prompt or a
tool. Run and review are separate commands because the bundle is the handoff: a
bundle can be re-reviewed with a better optimizer without paying for the runs
again, and a person can read the transcript before any model proposes anything.

## Tips

- Use `--json` flags for machine-readable output suitable for scripting.
- Set `NODETOOL_API_URL` environment variable to avoid specifying `--api-url` on every command.
- Use `nodetool serve` to start the local backend server before running API commands.
- See [Environment Variables](configuration.md#environment-variables-index) for a complete list of configurable variables.
