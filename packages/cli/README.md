# NodeTool execution CLI

The default CLI runs JSON workflows, starts the authenticated execution server,
and manages workflows, jobs, binary assets, encrypted secrets and remote text
models. Interactive chat, MCP, DSL compilation, media, games and deployment
commands require an explicitly installed feature.

Use the Node version pinned in [`.nvmrc`](../../.nvmrc).

```bash
npm install -g @nodetool-ai/cli
nodetool --help
nodetool --version
nodetool packs list
```

## Run locally with only an API key

Local commands need no server, pack, user ID or master key. The local user ID
defaults to `1`, as in the desktop app and the command features.

```bash
export OPENAI_API_KEY=...
nodetool text "Write a haiku about rivers"
echo "Summarize this" | nodetool text --model gpt-4.1 --system "Be brief" --json
nodetool nodes                       # built-in node types, as JSON
nodetool nodes --example > flow.json # input -> template -> LLM -> output
nodetool run flow.json --params '{"topic":"rivers"}'
```

`text`, `run` and `models list` read `OPENAI_API_KEY` from the local encrypted
store when `SECRETS_MASTER_KEY` is set and the key is stored, and from the
environment otherwise.

No single provider is required. `nodetool info` shows the credential state of
each provider (names only, never values), and `nodetool providers list` lists
the providers usable now: a key is set, an installed pack registers it, or, for
`claude_agent_sdk`, the `claude` CLI is found. `nodetool text` uses an
OpenAI-compatible endpoint. To use another provider, install a command feature
and pick the provider with `-p`:

```bash
nodetool packs add cli-chat --yes
nodetool agent run -p claude_agent_sdk --objective "Summarize README.md"   # default model: sonnet
nodetool packs add cli-workflow --yes
nodetool generate fal_ai --kind video --list-models                          # priced, cheapest first
```

## Start an authenticated server

Generate credentials once, keep them in your secret manager, and reuse the
master key when restarting against the same database.

```bash
export SECRETS_MASTER_KEY="$(openssl rand -base64 32)"
export NODETOOL_API_TOKEN="$(openssl rand -hex 32)"
nodetool serve --host 127.0.0.1 --port 7777
```

A single `NODETOOL_API_TOKEN` authenticates `NODETOOL_USER_ID` (default `1`).
For several users, set `NODETOOL_TOKENS` to a JSON object that maps each token
(at least 32 characters) to a user ID. Port 7777 is also the desktop app's
port; pass `--port` when it is running.

`NODETOOL_DATA_DIR` selects the SQLite, assets and workspace directory. It
defaults to `./nodetool-data`. Client commands use `NODETOOL_API_URL` and
`NODETOOL_API_TOKEN`, or the global `--api-url` and `--token` options. The
server accepts only explicitly configured bearer tokens.

Use the same environment in another terminal:

```bash
nodetool workflows list
nodetool workflows create workflow.json
nodetool workflows get <id>
nodetool workflows run <id> --params '{"prompt":"hello"}'
nodetool jobs get <job-id>
nodetool jobs cancel <job-id>
nodetool assets upload input.bin
nodetool assets download <asset-id> output.bin
printf '%s' "$OPENAI_API_KEY" | nodetool secrets store OPENAI_API_KEY
nodetool models list --provider openai
nodetool text 'Hello' --model <model-id>
```

Secret values are read from stdin and encrypted for the authenticated user.
Without a token, `secrets list` and `secrets set` use the local store instead. `OPENAI_BASE_URL` selects a public HTTPS OpenAI-compatible endpoint.

```bash
nodetool validate workflow.json
nodetool run workflow.json --params '{"prompt":"hello"}'
```

## Install selected command features

Use `nodetool packs list` to inspect the command features available for this
installation. Install the feature named by a command's `FEATURE_NOT_INSTALLED`
error through the existing pinned pack installer:

```bash
nodetool packs add cli-chat --yes
nodetool chat
nodetool packs add cli-workflow --yes
nodetool feature cli-workflow run workflow.ts --json
```

Commands do not install missing features automatically. Authored JavaScript and
TypeScript workflows, chat, provider SDKs, media and development tools select
their own command features. Installing one feature does not activate unrelated
command groups. `nodetool feature <feature-id> <command...>` selects one
installed feature explicitly when its command overlaps a native operation.
For example, `nodetool feature cli-workflow validate workflow.json --json`
uses the workflow authoring feature while `nodetool validate workflow.json`
uses the native validator.

MCP commands require `cli-mcp`. The classic server command is selected with
`nodetool server serve` after installing `cli-server`. The default `nodetool
serve` continues to start the minimal execution server.

See the [command reference](../../docs/cli.md) and
[minimal server](../server-minimal/README.md).
