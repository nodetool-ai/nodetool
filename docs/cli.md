---
layout: page
title: "NodeTool CLI"
---



The `nodetool` CLI is the TypeScript command-line interface for the NodeTool platform. It manages servers, workflows, jobs, assets, and secrets. Install the project and run `nodetool --help` to see the top-level command list. Every sub-command exposes its own `--help` flag with detailed usage.

## Installation

The CLI is part of the `@nodetool/cli` package in the monorepo. Build it with:

```bash
# From repo root
npm install
npm run build:packages
```

After building, you can run the CLI via:
```bash
node packages/cli/dist/nodetool.js --help
# Or via the npm script alias:
npm run nodetool -- --help
```

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

### `nodetool agent`

Runs an autonomous AI agent from start to finish using a YAML configuration file. Agents use the planning agent architecture to break down tasks, execute them iteratively, and achieve goals through tool usage.

**Arguments:**

- `--config FILE` (required) — Path to agent YAML configuration file.
- `--prompt TEXT` — Inline prompt for the agent to execute.
- `--prompt-file FILE` — Load prompt from a text file.
- `--interactive` / `-i` — Start interactive session with the agent.

**Options:**

- `--workspace DIR` — Override workspace directory from config.
- `--max-iterations N` — Override maximum planning iterations from config.
- `--output FILE` — Save agent output to file.
- `--jsonl` — Output in JSONL format for automation.
- `--verbose` / `-v` — Enable DEBUG-level logging.

**Examples:**

```bash
# Run agent with inline prompt
nodetool agent --config research-agent.yaml --prompt "Research AI trends"

# Run agent with prompt from file
nodetool agent --config code-assistant.yaml --prompt-file task.txt

# Interactive mode for multi-turn conversations
nodetool agent --config content-creator.yaml --interactive

# Save output to file
nodetool agent --config agent.yaml --prompt "Task" --output result.txt

# JSONL output for automation
nodetool agent --config agent.yaml --prompt "Task" --jsonl
```

**Agent Configuration:**

Agents are configured via YAML files that specify:

- **System prompt**: Instructions defining agent behavior
- **Model**: Primary AI model (provider and model ID)
- **Planning agent**: Always enabled, coordinates task execution
- **Tools**: Available capabilities (search, code execution, file operations)
- **Parameters**: Token limits, temperature, iteration limits
- **Workspace**: Sandboxed directory for file operations

See [Agent CLI Documentation](agent-cli.md) for complete configuration reference and [examples/agents/](examples/agents/) for sample configurations.

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

You can also start the server directly:

```bash
PORT=7777 HOST=127.0.0.1 node packages/websocket/dist/server.js
```

### `nodetool workflows run <workflow_id_or_file>`

Executes a workflow by ID (from the local database) or by JSON file path.

**Arguments:**

- `<workflow_id_or_file>` — workflow ID (loaded from DB) or path to a `.json` workflow file.

**Options:**

- `--params <json>` — JSON string of workflow parameters.
- `--json` — output result as JSON.

**Examples:**

```bash
# Run workflow by ID
nodetool workflows run workflow_abc123

# Run workflow from file
nodetool workflows run ./my_workflow.json

# Run with parameters as JSON
nodetool workflows run workflow_abc123 --params '{"input": "hello"}'

# JSON output for automation
nodetool workflows run ./my_workflow.json --json
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

