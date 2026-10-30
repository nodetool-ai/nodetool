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

## Start an authenticated server

Generate credentials once, keep them in your secret manager, and reuse the
master key when restarting against the same database.

```bash
export SECRETS_MASTER_KEY="$(openssl rand -base64 32)"
export NODETOOL_API_TOKEN="$(openssl rand -hex 32)"
export NODETOOL_USER_ID=local
export NODETOOL_TOKENS="$(node -e 'process.stdout.write(JSON.stringify({[process.env.NODETOOL_API_TOKEN]:process.env.NODETOOL_USER_ID}))')"
nodetool serve --host 127.0.0.1 --port 7777
```

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
Local text calls use `NODETOOL_USER_ID`, the same data directory and master
key. `OPENAI_BASE_URL` selects a public HTTPS OpenAI-compatible endpoint.

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
