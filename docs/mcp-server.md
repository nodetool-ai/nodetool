---
layout: page
title: "NodeTool as an MCP Server"
permalink: /mcp-server
description: "Use NodeTool from Claude Code, Codex, OpenCode, Cursor, or any MCP client. One command registers the server. The desktop app is optional."
---

NodeTool runs as a Model Context Protocol (MCP) server. An agent harness such
as Claude Code, Codex, or OpenCode starts it and gets NodeTool's toolbelt:
workflows, image, video, and audio generation, assets, nodes, collections, and
the editors. The desktop app is optional.

## Install

You need Node.js 22 or later. Run this in a terminal:

```bash
npx -y --package=@nodetool-ai/cli nodetool mcp install
```

Or install the CLI once and use the short form:

```bash
npm install -g @nodetool-ai/cli
nodetool mcp install
```

The command does these steps:

1. It finds Claude Code, Codex, and OpenCode on the machine.
2. It starts the server once and lists its tools. This proves that the server
   works and fills the `npx` cache, so the harness's first start is fast.
3. It writes a `nodetool` entry into each client's config.

Restart the harness, then ask it: "Use NodeTool to list my workflows."

To install for one client, add `--claude`, `--codex`, or `--opencode`.
Check the result with `nodetool mcp status --check`. Remove the entries with
`nodetool mcp uninstall`.

## What the install writes

The entry starts `nodetool mcp serve` over stdio. The command is `nodetool` when
the CLI is on `PATH`, and `npx -y --package=@nodetool-ai/cli nodetool` when it
is not. Add `--npx` to always use `npx`.

| Client | File | Scope |
|---|---|---|
| Claude Code | `~/.claude.json`, key `mcpServers` | User scope, every project |
| Codex | `~/.codex/config.toml`, block `[mcp_servers.nodetool]` | Every session |
| OpenCode | `~/.config/opencode/opencode.json`, key `mcp` | Every session |

Codex and OpenCode get a 120-second start timeout and a 900-second tool
timeout, because a video generation can run for minutes.

Earlier versions wrote the Claude Code entry under `projects["<home>"]`, so it
worked only in sessions started in the home directory. A new install moves that
entry to the user scope.

## Other clients

Print a config block for Cursor, Claude Desktop, Windsurf, or any client that
reads `mcpServers` JSON:

```bash
nodetool mcp config
```

```json
{
  "mcpServers": {
    "nodetool": {
      "command": "nodetool",
      "args": ["mcp", "serve"]
    }
  }
}
```

To register the server with Claude Code by hand, run:

```bash
claude mcp add --scope user nodetool -- npx -y --package=@nodetool-ai/cli nodetool mcp serve
```

Claude Desktop also installs the bundled extension from Studio: open
**Settings → MCP Servers → Install Extension**.

## Provider keys

Generation tools call provider APIs, so the server needs your keys. Store a key
once in the NodeTool secret store:

```bash
nodetool secrets store FAL_API_KEY
nodetool secrets store OPENAI_API_KEY
```

Keys you add in Studio settings go to the same store. When a key is not in
the store, the server reads the environment variable with the same name. To
pass one through Claude Code, add `-e FAL_API_KEY=...` to `claude mcp add`.

Tools that need no provider work without keys: node search, workflow
validation, assets, and the local file tools.

## With and without Studio

`nodetool mcp serve` checks for a running NodeTool server on port 7777 (or
`PORT`). When one answers, the stdio process forwards every request to it.
Actions then run in that process, and an open editor shows the agent's changes
as they happen.

When no server answers, `mcp serve` runs its own MCP server over the default
NodeTool data directory. The agent keeps full access to workflows, assets, and
generation.

To connect a client to a running server over HTTP instead, install with
`--http`. That entry works only while the server runs:

```bash
nodetool mcp install --http                       # http://127.0.0.1:7777/mcp
nodetool mcp install --url http://127.0.0.1:8000/mcp
```

For a NodeTool server on another machine, create an access token in
**Settings → MCP Servers → Connect an agent remotely**. See
[MCP on a production server](mcp-production.md) for the server side.

## What the agent gets

The server offers a small set of direct tools. The main tool is `execute_code`,
which runs sandboxed JavaScript that calls `nodetool.<namespace>.<method>()`.
Through it the agent reaches workflow building and debugging, media generation,
assets, collections, documents, web search, and memory. The agent finds a tool
with `nodetool.searchTools("query")`. The full list is in the
[CLI reference](cli.md#what-the-mcp-server-exposes).

## Troubleshooting

| Symptom | Fix |
|---|---|
| The harness shows the server as failed | Run `nodetool mcp status --check`. It starts each registered server and prints the error. |
| `npm error could not determine executable to run` | The command lacks `--package=@nodetool-ai/cli`. The package has two binaries. Reinstall with `nodetool mcp install`. |
| The first start times out | Run `nodetool mcp install` again. It fills the `npx` cache before the harness starts the server. |
| `nodetool mcp serve` fails, but `npx` works | A legacy Python `nodetool` is first on `PATH`. Install with `--npx`, or put the npm global bin first on `PATH`. |
| A generation fails with a missing key | Store the key with `nodetool secrets store <NAME>`. |
