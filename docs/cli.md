---
layout: page
title: "NodeTool CLI"
---



The `nodetool` CLI manages local development workflows, servers, deployments, and admin tooling. Install the project and run `nodetool --help` (or `python -m nodetool.cli --help`) to see the top-level command list. Every sub-command exposes its own `--help` flag with detailed usage.

## Getting Help

- `nodetool --help` — list all top-level commands and groups.
- `nodetool <command> --help` — show command-specific options (e.g. `nodetool serve --help`).
- `nodetool <group> --help` — list sub-commands for grouped tooling (e.g. `nodetool deploy --help`).

## Core Runtime Commands

### `nodetool serve`

Runs the FastAPI backend server for the NodeTool platform. This serves the REST API, WebSocket endpoints, and optionally static assets or app bundles.

**Options:**

- `--host` (default `127.0.0.1`) — bind address (use `0.0.0.0` for all interfaces).
- `--port` (default `8000`) — listen port.
- `--static-folder` — path to folder containing static web assets (e.g., compiled React UI).
- `--force-fp16` — force FP16 precision for ComfyUI integrations if available (GPU optimization).
- `--reload` — enable auto-reload on file changes (development only).
- `--production` — enable production mode (stricter validation, optimizations).
- `--remote-auth` — enable remote authentication (Supabase-backed auth).
- `--verbose` / `-v` — enable DEBUG-level logging for troubleshooting.

**Examples:**

```bash
# Development server with auto-reload
nodetool serve --reload --verbose

# Production server with static assets
nodetool serve --production --static-folder ./web/dist --host 0.0.0.0 --port 8000

# Development with remote auth
nodetool serve --remote-auth --verbose
```

### `nodetool run`

Executes a workflow by ID, file path, or JSON payload. Supports multiple modes: interactive, JSONL for automation, and stdin for programmatic execution.

**Arguments:**

- `WORKFLOW` (optional) — workflow ID or path to workflow JSON file.

**Options:**

- `--jsonl` — output raw JSONL (JSON Lines) format instead of pretty-printed output. Each line is a valid JSON object representing workflow progress. Useful for subprocess/automation integration.
- `--stdin` — read an entire `RunJobRequest` JSON from stdin instead of from argument or interactive prompt.
- `--user-id` (default `1`) — user ID for workflow execution context.
- `--auth-token` (default `local_token`) — authentication token for workflow execution.
- `--verbose` / `-v` — enable DEBUG-level logging.

**Examples:**

```bash
# Interactive mode: Run workflow by ID
nodetool run workflow_abc123

# Interactive mode: Run workflow from file
nodetool run ./my_workflow.json

# JSONL mode: Run with JSON output for parsing
nodetool run workflow_abc123 --jsonl

# Stdin mode: Run from piped JSON
cat run_request.json | nodetool run --stdin

# With custom user and auth token
nodetool run workflow_abc123 --user-id user123 --auth-token sk-token
```

### `nodetool worker`

Starts a deployable worker process with OpenAI-compatible endpoints. This is used for running NodeTool as a backend service with chat/completion API support.

**Options:**

- `--host` (default `0.0.0.0`) — bind address (listen on all interfaces for deployments).
- `--port` (default `8000`) — listen port.
- `--remote-auth` — require Supabase-backed authentication.
- `--default-model` (default `gpt-oss:20b`) — fallback model when client doesn't specify one.
- `--provider` (default `ollama`) — provider for the default model (e.g., `openai`, `anthropic`, `ollama`).
- `--tools` — comma-separated list of tools to enable (e.g., `google_search,browser`).
- `--workflow` — one or more workflow JSON files to register with the worker.
- `--verbose` / `-v` — enable DEBUG-level logging.

**Examples:**

```bash
# Basic worker with default Ollama model
nodetool worker

# Worker with custom model and tools
nodetool worker --default-model gpt-4 --provider openai --tools google_search,browser

# Worker with custom workflows
nodetool worker --workflow workflow1.json --workflow workflow2.json --host 0.0.0.0 --port 8080

# Deployable worker with auth
nodetool worker --remote-auth --host 0.0.0.0 --port 8000
```

## Chat Client

### `nodetool chat-client`

Interactive or non-interactive client for connecting to the OpenAI API, a local NodeTool chat server, or a RunPod serverless endpoint. Supports streaming responses and multi-turn conversations.

**Options:**

- `--server-url` — override default OpenAI URL to point to a local chat server or custom endpoint.
- `--runpod-endpoint` — convenience shortcut for RunPod serverless endpoint IDs (e.g., `abc123xyz`).
- `--auth-token` — HTTP authentication token for server (falls back to `RUNPOD_API_KEY` environment variable).
- `--message` — send a single message in non-interactive mode (no conversation loop).
- `--model` (default `gpt-4o-mini` for OpenAI) — model to use (e.g., `gpt-4o`, `gpt-oss:20b`).
- `--provider` — AI provider when connecting to local server (e.g., `openai`, `anthropic`, `ollama`).
- `--verbose` / `-v` — enable DEBUG-level logging.

**Examples:**

```bash
# Interactive client with OpenAI
nodetool chat-client

# Single message to OpenAI
nodetool chat-client --message "What is the capital of France?"

# Connect to local chat server
nodetool chat-client --server-url http://localhost:8080 --provider ollama --model gpt-oss:20b

# Connect to RunPod endpoint
nodetool chat-client --runpod-endpoint abc123xyz --auth-token $RUNPOD_API_KEY

# Interactive session with custom model
nodetool chat-client --server-url http://localhost:8080 --model claude-3-opus --provider anthropic
```

## Developer Tools

### `nodetool mcp`

Starts the NodeTool Model Context Protocol (MCP) server implementation. This enables IDE integrations (e.g., Claude Code, other MCP-compatible IDEs) to access NodeTool workflows and capabilities.

**See also:** [Model Context Protocol](https://modelcontextprotocol.io/)

**Examples:**

```bash
# Start MCP server (typically auto-started by IDEs)
nodetool mcp
```

### `nodetool test-runpod`

Runs an automated health and inference check against a RunPod endpoint.

**Options:**

- `--endpoint-id` (required) — RunPod serverless endpoint ID.
- `--params` — JSON file with request parameters.
- `--timeout` — request timeout in seconds (default 60).
- `--output` — write JSON results to a file.
- `--verbose` / `-v` — enable DEBUG logs.

**Examples:**

```bash
nodetool test-runpod --endpoint-id YOUR_ENDPOINT_ID
nodetool test-runpod --endpoint-id YOUR_ENDPOINT_ID --params examples/test_params_basic.json --timeout 30
```

### `nodetool codegen`

Regenerates DSL (Domain-Specific Language) modules from node definitions. Scans node packages and generates Python code for type-safe workflow creation.

**Behavior:** Completely wipes and recreates corresponding `src/nodetool/dsl/<namespace>/` directories before writing generated files.

**Examples:**

```bash
# Regenerate all DSL modules
nodetool codegen

# Verbose output
nodetool codegen --verbose
```

## Secrets Management

### `nodetool secrets`

Manage encrypted secrets stored in the database with per-user encryption.

**Subcommands:**

- `secrets list` — list stored secret metadata without revealing values.
- `secrets store` — securely store or update a secret value.

#### `nodetool secrets list`

List all stored secrets for a user (values not displayed).

**Options:**

- `--user-id` / `-u` (default `1`) — user ID to list secrets for.
- `--limit` (default `100`) — maximum number of secrets to return.

**Example:**

```bash
nodetool secrets list --user-id user123
```

#### `nodetool secrets store`

Interactively store or update an encrypted secret. Prompts securely for the secret value (input masked).

**Options:**

- `--user-id` / `-u` (default `1`) — user ID that owns the secret.
- `--description` / `-d` — optional description for the secret.
- `--force` — store without requiring confirmation of the value.

**Example:**

```bash
nodetool secrets store OPENAI_API_KEY --description "My OpenAI API key"
nodetool secrets store HUGGINGFACE_TOKEN --user-id user123 --force
```

**See also:** [Secret Storage and Master Key](configuration.md#secret-storage-and-master-key)

## Settings & Packages

### `nodetool settings`

Commands for viewing and editing configuration settings and secrets files.

**Subcommands:**

- `settings show` — display the current settings table (reads `settings.yaml` or `secrets.yaml`).
- `settings edit [--secrets]` — open editable YAML file in `$EDITOR`.

#### `nodetool settings show`

Display all configured settings or secrets.

**Options:**

- `--secrets` — show secrets instead of settings.

**Example:**

```bash
nodetool settings show
nodetool settings show --secrets
```

#### `nodetool settings edit`

Open the settings or secrets file in your configured editor (`$EDITOR` environment variable).

**Options:**

- `--secrets` — edit secrets.yaml instead of settings.yaml.

**Example:**

```bash
nodetool settings edit
nodetool settings edit --secrets
```

### `nodetool package`

Commands for managing NodeTool packages and generating documentation.

**Subcommands:**

- `package list` — show installed packages.
- `package list --available` — show packages available in registry.
- `package scan` — discover nodes and update package metadata.
- `package init` — scaffold a new NodeTool package.
- `package docs` — generate Markdown documentation for package nodes.

#### `nodetool package list`

List installed packages or available packages from the registry.

**Options:**

- `--available` / `-a` — list available packages from registry instead of installed packages.

**Example:**

```bash
nodetool package list
nodetool package list --available
```

#### `nodetool package scan`

Discover nodes in the current project and create/update package metadata.

**Options:**

- `--verbose` / `-v` — enable verbose output during scanning.

**Example:**

```bash
nodetool package scan --verbose
```

#### `nodetool package init`

Scaffold a new NodeTool package with `pyproject.toml` and metadata folder structure.

**Example:**

```bash
nodetool package init
```

#### `nodetool package docs`

Generate Markdown documentation for all nodes in the package.

**Options:**

- `--output-dir` (default `docs`) — directory where documentation will be generated.
- `--compact` — generate compact documentation suitable for LLM input.
- `--verbose` / `-v` — enable verbose output.

**Example:**

```bash
nodetool package docs --output-dir ./docs
nodetool package docs --compact --output-dir ./llm-docs
```

See the [Package Registry Guide](packages.md) for publishing and metadata details.

## Administration & Deployment

### `nodetool admin`

Maintenance utilities for model assets and caches. Manage HuggingFace and Ollama model downloads, cache inspection, and cleanup.

**Subcommands:**

- `admin download-hf` — download HuggingFace models locally or via remote server.
- `admin download-ollama` — pre-pull Ollama model blobs.
- `admin scan-cache` — inspect cache usage and statistics.
- `admin delete-hf` — remove cached HuggingFace repositories.
- `admin cache-size` — report aggregate cache sizes.

#### `nodetool admin download-hf`

Download a HuggingFace model for local use or via a remote server.

**Options:**

- `--repo-id` (required) — HuggingFace repository ID (e.g., `meta-llama/Llama-2-7b-hf`).
- `--file-path` — specific file path within the repo to download.
- `--server-url` — download via remote server instead of locally.
- `--ignore-patterns` — glob patterns to exclude from download.
- `--allow-patterns` — glob patterns to include in download.

**Example:**

```bash
nodetool admin download-hf --repo-id meta-llama/Llama-2-7b-hf
nodetool admin download-hf --repo-id mistralai/Mistral-7B --server-url http://remote.server:8000
```

#### `nodetool admin download-ollama`

Pre-pull an Ollama model blob locally or via remote server.

**Options:**

- `--model-name` (required) — Ollama model name (e.g., `llama2`, `mistral:latest`).
- `--server-url` — download via remote server instead of locally.

**Example:**

```bash
nodetool admin download-ollama --model-name llama2
nodetool admin download-ollama --model-name mistral:latest --server-url http://remote.server:8000
```

#### `nodetool admin scan-cache`

Inspect cache directories and display usage statistics.

**Options:**

- `--server-url` — scan remote server cache instead of local.

**Example:**

```bash
nodetool admin scan-cache
nodetool admin scan-cache --server-url http://remote.server:8000
```

#### `nodetool admin delete-hf`

Remove a cached HuggingFace repository from local disk or remote server.

**Options:**

- `--repo-id` (required) — repository to delete.
- `--server-url` — delete from remote server instead of locally.

**Example:**

```bash
nodetool admin delete-hf --repo-id meta-llama/Llama-2-7b-hf
```

#### `nodetool admin cache-size`

Report aggregate cache sizes for HuggingFace and Ollama models.

**Options:**

- `--cache-dir` — custom cache directory path.
- `--server-url` — get remote server cache sizes.
- `--api-key` — API key for remote server authentication.

**Example:**

```bash
nodetool admin cache-size
nodetool admin cache-size --server-url http://remote.server:8000
```

### `nodetool deploy`

Controls deployments described in `deployment.yaml`. Manage cloud and self-hosted deployments (RunPod, Google Cloud Run, self-hosted Docker, etc.).

**Subcommands:**

- `deploy init` — create a new deployment configuration.
- `deploy show` — display deployment details.
- `deploy add` — interactively add a new deployment.
- `deploy edit` — interactively edit a deployment.
- `deploy list` — list all configured deployments.
- `deploy plan` — preview pending deployment changes.
- `deploy apply` — apply deployment configuration to target environment.
- `deploy status` — query deployment status.
- `deploy logs` — stream deployment logs.
- `deploy destroy` — tear down a deployment.
- `deploy workflows` — manage workflows on deployed instances.
- `deploy collections` — manage vector database collections on deployed instances.

#### `nodetool deploy init`

Create a new `deployment.yaml` configuration file.

**Example:**

```bash
nodetool deploy init
```

#### `nodetool deploy show`

Display detailed information about a deployment.

**Arguments:**

- `NAME` — deployment name.

**Example:**

```bash
nodetool deploy show my-runpod-deployment
```

#### `nodetool deploy add`

Interactively add a new deployment configuration.

**Arguments:**

- `NAME` — name for the deployment.
- `TYPE` — deployment type (e.g., `runpod`, `google-cloud-run`, `self-hosted`).

**Example:**

```bash
nodetool deploy add my-deployment runpod
nodetool deploy add prod-gcp google-cloud-run
```

#### `nodetool deploy edit`

Interactively edit an existing deployment configuration.

**Arguments:**

- `NAME` (optional) — deployment to edit. If omitted, prompts for selection.

**Example:**

```bash
nodetool deploy edit my-deployment
nodetool deploy edit  # Interactive selection
```

#### `nodetool deploy list`

List all configured deployments with their types and statuses.

**Example:**

```bash
nodetool deploy list
```

#### `nodetool deploy plan`

Preview pending deployment changes without applying them.

**Arguments:**

- `NAME` — deployment to plan.

**Example:**

```bash
nodetool deploy plan my-deployment
```

#### `nodetool deploy apply`

Apply deployment configuration to the target environment (create/update resources).

**Arguments:**

- `NAME` — deployment to apply.

**Options:**

- `--dry-run` — preview changes without applying.

**Example:**

```bash
nodetool deploy apply my-deployment
nodetool deploy apply my-deployment --dry-run
```

#### `nodetool deploy status`

Query the current status of a deployment.

**Arguments:**

- `NAME` — deployment name.

**Example:**

```bash
nodetool deploy status my-deployment
```

#### `nodetool deploy logs`

Stream logs from a deployment.

**Arguments:**

- `NAME` — deployment name.

**Options:**

- `--service` — specific service to get logs from.
- `--follow` / `-f` — follow logs in real-time.
- `--tail` (default `100`) — number of previous lines to show.

**Example:**

```bash
nodetool deploy logs my-deployment --follow
nodetool deploy logs my-deployment --service worker --tail 50
```

#### `nodetool deploy destroy`

Tear down a deployment and delete resources.

**Arguments:**

- `NAME` — deployment to destroy.

**Options:**

- `--force` / `-f` — skip confirmation prompt.

**Example:**

```bash
nodetool deploy destroy my-deployment
nodetool deploy destroy my-deployment --force
```

#### `nodetool deploy workflows`

Manage workflows on deployed instances.

**Subcommands:**

- `deploy workflows sync` — sync a workflow to a deployed instance.
- `deploy workflows list` — list workflows on a deployed instance.
- `deploy workflows delete` — delete a workflow from a deployed instance.
- `deploy workflows run` — run a workflow on a deployed instance.

**Subcommand: deploy workflows sync**

Sync a local workflow to a deployed instance, including models and assets.

**Arguments:**

- `DEPLOYMENT_NAME` — deployment to sync to.
- `WORKFLOW_ID` — workflow ID to sync.

**Behavior:** Downloads referenced models (HuggingFace, Ollama) and syncs assets automatically.

**Example:**

```bash
nodetool deploy workflows sync my-deployment workflow_abc123
```

**Subcommand: deploy workflows list**

List all workflows on a deployed instance.

**Arguments:**

- `DEPLOYMENT_NAME` — deployment name.

**Example:**

```bash
nodetool deploy workflows list my-deployment
```

**Subcommand: deploy workflows delete**

Delete a workflow from a deployed instance.

**Arguments:**

- `DEPLOYMENT_NAME` — deployment name.
- `WORKFLOW_ID` — workflow ID to delete.

**Options:**

- `--force` / `-f` — skip confirmation.

**Example:**

```bash
nodetool deploy workflows delete my-deployment workflow_abc123
nodetool deploy workflows delete my-deployment workflow_abc123 --force
```

**Subcommand: deploy workflows run**

Run a workflow on a deployed instance with custom parameters.

**Arguments:**

- `DEPLOYMENT_NAME` — deployment name.
- `WORKFLOW_ID` — workflow ID to run.
- `PARAMS` — workflow parameters as `key=value` pairs.

**Example:**

```bash
nodetool deploy workflows run my-deployment workflow_abc123 prompt="Hello" model="gpt-4"
```

#### `nodetool deploy collections`

Manage vector database collections on deployed instances.

**Subcommands:**

- `deploy collections sync` — sync a local collection to a deployed instance.

**Subcommand: deploy collections sync**

Sync a local ChromaDB collection to a deployed instance.

**Arguments:**

- `DEPLOYMENT_NAME` — deployment name.
- `COLLECTION_NAME` — collection name to sync.

**Behavior:** Creates collection on remote if needed and syncs all documents, embeddings, and metadata.

**Example:**

```bash
nodetool deploy collections sync my-deployment my-documents
```

### `nodetool sync`

Synchronize database entries with a remote NodeTool server. Push local workflows and data to remote deployments.

**Subcommands:**

- `sync workflow` — sync a workflow to a remote server.

#### `nodetool sync workflow`

Push a local workflow to a remote NodeTool server.

**Options:**

- `--id` (required) — workflow ID to sync.
- `--server-url` (required) — remote server base URL (e.g., `http://localhost:8000`).

**Examples:**

```bash
nodetool sync workflow --id workflow_abc123 --server-url http://remote.server:8000
nodetool sync workflow --id workflow_abc123 --server-url https://api.example.com
```

### Proxy Utilities

The proxy commands manage the Docker-aware reverse proxy used in self-hosted setups. The proxy handles container lifecycle (start on demand, stop after idle timeout) and TLS/ACME certificate management.

#### `nodetool proxy`

Start the async Docker reverse proxy server.

**Options:**

- `--config` (required) — path to proxy configuration YAML file.
- `--host` (default `0.0.0.0`) — host to bind to.
- `--port` (default `443`) — port to bind to.
- `--no-tls` — disable TLS and serve HTTP only.
- `--verbose` / `-v` — enable DEBUG-level logging.

**Behavior:** Routes HTTP requests to Docker containers, starting them on-demand and stopping after idle timeout. Supports Let's Encrypt ACME for automatic TLS certificate management.

**Examples:**

```bash
# Start proxy with HTTPS on port 443
nodetool proxy --config /etc/proxy/config.yaml

# Start proxy on HTTP port 8080
nodetool proxy --config /etc/proxy/config.yaml --port 8080 --no-tls

# Start with verbose logging
nodetool proxy --config /etc/proxy/config.yaml --verbose
```

#### `nodetool proxy-daemon`

Run the FastAPI proxy with ACME HTTP and HTTPS listeners concurrently. Designed for use as a background service.

**Options:**

- `--config` (required) — path to proxy configuration YAML file.
- `--verbose` / `-v` — enable DEBUG-level logging.

**Examples:**

```bash
nodetool proxy-daemon --config /etc/proxy/config.yaml
nodetool proxy-daemon --config /etc/proxy/config.yaml --verbose
```

#### `nodetool proxy-status`

Check the status and health of running proxy services.

**Options:**

- `--config` (required) — path to proxy configuration YAML file.
- `--server-url` (default `http://localhost/status`) — proxy status endpoint URL.
- `--bearer-token` — authentication token (defaults to config value).

**Display:** Shows table of all managed services with status (running/stopped/not created) and last access time.

**Examples:**

```bash
# Check local proxy status
nodetool proxy-status --config /etc/proxy/config.yaml

# Check remote proxy status
nodetool proxy-status --config /etc/proxy/config.yaml \
  --server-url https://proxy.example.com/status \
  --bearer-token MY_TOKEN
```

#### `nodetool proxy-validate-config`

Validate proxy configuration file for errors before deployment.

**Options:**

- `--config` (required) — path to proxy configuration YAML file.

**Behavior:** Loads and validates the configuration, checking service definitions and global settings. Displays all configured services in a table.

**Examples:**

```bash
nodetool proxy-validate-config --config /etc/proxy/config.yaml
```

## Utility Commands

### `nodetool list-gcp-options`

List available Google Cloud Run configuration options for deployments.

**Display:** Shows available regions, CPU options, memory options, and Docker registry options for GCP deployments.

**Example:**

```bash
nodetool list-gcp-options
```

## Tips

- Commands that contact remote services load `.env` files automatically via `python-dotenv`. Ensure required environment variables are present.
- Use `--verbose` / `-v` where available to enable DEBUG-level logging for troubleshooting.
- For deployment operations, ensure Docker is installed and configured with appropriate registry credentials.
- Configuration files (deployment.yaml, proxy configs) support environment variable substitution (e.g., `${ENV_VAR_NAME}`).
- See [Environment Variables Index](configuration.md#environment-variables-index) for a complete list of configurable variables.
