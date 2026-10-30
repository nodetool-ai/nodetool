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

## Install full capabilities

```bash
nodetool packs add cli-full --yes
nodetool full --help
nodetool full mcp serve
nodetool-chat
```

This uses the existing pinned pack installer. Commands do not install missing
features automatically. Authored JavaScript and TypeScript workflows delegate
to the installed full feature. Missing features return `FEATURE_NOT_INSTALLED`
with feature IDs. The full server remains available as `nodetool full serve`.

See the [full CLI package](../cli-full/README.md),
[command reference](../../docs/cli.md), and
[minimal server](../server-minimal/README.md).
