---
layout: page
title: "NodeTool CLI"
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
npx --package=@nodetool-ai/cli nodetool-chat --agent
```

**Requires Node.js 24+.** Check with `node --version`; install via [nvm](https://github.com/nvm-sh/nvm) if needed.

## Getting Help

- `nodetool --help` — list all top-level commands.
- `nodetool <command> --help` — show command-specific options (e.g. `nodetool serve --help`).
- `nodetool <group> --help` — list sub-commands for grouped tooling (e.g. `nodetool workflows --help`).

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

You can also set the bind address and port via environment variables:

```bash
PORT=8080 HOST=0.0.0.0 nodetool serve
```

### `nodetool workflows run <workflow_id_or_file>`

Executes a workflow by ID (from the local database), JSON file, or TypeScript DSL file.

**Arguments:**

- `<workflow_id_or_file>` — workflow ID, path to a `.json` workflow file, or path to a `.ts` DSL file.

**Options:**

- `--params <json>` — JSON string of workflow parameters.
- `--json` — output result as JSON.

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

**Examples:**

```bash
nodetool run workflow.ts
nodetool run workflow.ts --json
```

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
- `-a, --agent` — enable agent mode with tool use.
- `-u, --url <url>` — WebSocket server URL (default: connects to local server).
- `-w, --workspace <path>` — workspace directory for file operations.
- `--tools <tools>` — comma-separated list of enabled tools.

**Examples:**

```bash
# Start interactive chat
nodetool chat

# Chat with a specific provider and model
nodetool chat --provider anthropic --model claude-3-5-sonnet-20241022

# Agent mode with tool use
nodetool chat --agent --provider openai

# Connect to a custom server
nodetool chat --url ws://localhost:7777
```

## Workflow Management

### `nodetool workflows`

Manage workflows via the API.

**Subcommands:** `list`, `get`, `run`

```bash
# List all workflows
nodetool workflows list
nodetool workflows list --api-url http://localhost:7777 --json

# Get a workflow by ID
nodetool workflows get <workflow_id>

# Run a workflow (see above for full options)
nodetool workflows run <workflow_id_or_file>
```

## Job Management

### `nodetool jobs`

Query job status and results.

**Subcommands:** `list`, `get`

**Options:**

- `--api-url <url>` — API base URL (default: `http://localhost:7777`).
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

Manage uploaded files and workflow assets.

**Subcommands:** `list`, `get`

**Options:**

- `--api-url <url>` — API base URL (default: `http://localhost:7777`).
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

## Tips

- Use `--json` flags for machine-readable output suitable for scripting.
- Set `NODETOOL_API_URL` environment variable to avoid specifying `--api-url` on every command.
- Use `nodetool serve` to start the local backend server before running API commands.
- See [Environment Variables](configuration.md#environment-variables-index) for a complete list of configurable variables.

