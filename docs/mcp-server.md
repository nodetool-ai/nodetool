---
layout: page
title: "NodeTool as an MCP Server"
permalink: /mcp-server
description: "Use NodeTool from Claude Code, Codex, OpenCode, Cursor, or any MCP client. One command registers the server. The desktop app is optional."
---

Run one command to give Claude Code, Codex, or OpenCode access to NodeTool workflows, assets, and media generation. The desktop app is optional.

```bash
npx -y @nodetool-ai/cli-mcp install
```

Restart the harness, then ask it: "Use NodeTool to list my workflows."

> **Runs:** locally over stdio, or against a running NodeTool server over HTTP. **Needs:** Node.js 22 or later. Generation tools need provider keys (see [Provider keys](#provider-keys)).
{: .callout-note}

For the tool names and the protocol details, see the [MCP Tool Reference](developer/mcp-tools.md).

## Install

To install the executable globally instead of using `npx`:

```bash
npm install -g @nodetool-ai/cli-mcp
nodetool-mcp install
```

`install` does these steps:

1. It finds Claude Code, Codex, and OpenCode on the machine.
2. It starts the server once and lists its tools. This proves that the server works and fills the `npx` cache, so the harness's first start is fast.
3. It writes a `nodetool` entry into each client's config.

To install for one client, add `--claude`, `--codex`, or `--opencode`. Add `--no-verify` to write the config without starting the server first. Check the result with `nodetool-mcp status --check`. Remove the entries with `nodetool-mcp uninstall`.

To use the same feature through the default CLI, run `nodetool packs add cli-mcp --yes`, then use `nodetool mcp` in place of `nodetool-mcp`. Pack-managed features do not add global binaries.

## What the install writes

Each client gets an entry that starts `nodetool-mcp serve` over stdio:

```json
{
  "mcpServers": {
    "nodetool": {
      "command": "nodetool-mcp",
      "args": ["serve"]
    }
  }
}
```

The command is `nodetool-mcp` when the CLI is on `PATH`, and `npx -y @nodetool-ai/cli-mcp serve` when it is not. Add `--npx` to always use `npx`.

| Client | File | Scope |
|---|---|---|
| Claude Code | `~/.claude.json`, key `mcpServers` | User scope, every project |
| Codex | `~/.codex/config.toml`, block `[mcp_servers.nodetool]` | Every session |
| OpenCode | `~/.config/opencode/opencode.json`, key `mcp` | Every session |

Codex gets a 120-second start timeout and a 900-second tool timeout, because a video generation can run for minutes. OpenCode gets the 120-second timeout.

Earlier versions wrote the Claude Code entry under `projects["<home>"]`, so it worked only in sessions started in the home directory. A new install moves that entry to the user scope.

## Other clients

For Cursor, Claude Desktop, Windsurf, or any client that reads `mcpServers` JSON, print the block above with:

```bash
nodetool-mcp config
```

To register the server with Claude Code by hand, run:

```bash
claude mcp add --scope user nodetool -- npx -y @nodetool-ai/cli-mcp serve
```

Claude Desktop can also install the bundled extension from the desktop app: open **Settings → Integrations → MCP integration** and select **Install extension**.

## What the agent can do

The agent works with your NodeTool data and providers:

- It lists, builds, validates, and runs workflows, and saves, finds, and views assets.
- It generates images, video, speech, and music, and transcribes audio. Generation tools use the providers you configured.
- It searches node types and reads their inputs and outputs.
- It lists NodeTool skills. In Claude Code each skill also appears as a slash command.
- It opens your mini apps (see [Mini apps in the host](#mini-apps-in-the-host)).

The agent does the rest by writing JavaScript that NodeTool runs in a sandbox. The full list of tools is in the [MCP Tool Reference](developer/mcp-tools.md).

## Provider keys

Store a key once in the NodeTool secret store:

```bash
nodetool secrets store FAL_API_KEY
nodetool secrets store OPENAI_API_KEY
```

Keys you add in the desktop app's settings go to the same store. When a key is not in the store, the server reads the environment variable with the same name. To pass one through Claude Code, add `-e FAL_API_KEY=...` to `claude mcp add`.

Tools that need no provider work without keys: node search, workflow validation, assets, and the local file tools.

## With and without Studio

`nodetool-mcp serve` checks for a running classic API server on `127.0.0.1` at port 7777 (or `PORT`), over HTTPS when `TLS_CERT` and `TLS_KEY` are set. When one answers its MCP handshake, the stdio process forwards every request to it. Actions then run in that process, and an open editor shows the agent's changes as they happen.

When no server answers, `nodetool-mcp serve` runs its own MCP server over the default NodeTool data directory. The agent keeps full access to workflows, assets, and generation.

To connect a client to a running server over HTTP instead, install with `--http`. That entry works only while the server runs:

```bash
nodetool-mcp install --http                       # http://127.0.0.1:7777/mcp
nodetool-mcp install --url http://127.0.0.1:8000/mcp
```

For a NodeTool server on another machine, create an access token in **Settings → Integrations → MCP integration → Connect an agent remotely**. See [MCP on a production server](mcp-production.md) for the server side.

## Mini apps in the host

Ask the agent to open one of your mini apps. In a host that supports the [MCP Apps extension](https://modelcontextprotocol.io/extensions/apps/overview), the app's screen appears in the conversation. You fill its fields and press its buttons there. Other hosts get a text summary of the app and its operations.

The screen is the app's default working instance, the same one **Run** opens in Studio. It runs the released version when the app has one, otherwise the draft. Each run is an app run with origin `agent`: the app's spend budget applies, and the run appears in the app's run history.

Model pickers offer the models the app's own graphs use. Widgets that edit NodeTool documents, such as Storyboard and Timeline, show a note that they work only in NodeTool.

A run is tracked by the server process that started it. When another replica answers, or the server restarted, the screen reports that the run is gone. The run still finishes, and its result is in the app's run history in Studio.

The renderer and the app-only tools behind the screen are described in the [MCP Tool Reference](developer/mcp-tools.md#mini-app-protocol).

## Troubleshooting

| Symptom | Fix |
|---|---|
| The harness shows the server as failed | Run `nodetool-mcp status --check`. It starts each registered server and prints the error. |
| `npm error could not determine executable to run` | Use `npx -y @nodetool-ai/cli-mcp install`. This package supplies one executable, which npm selects automatically. |
| The first start times out | Run `nodetool-mcp install` again. It fills the `npx` cache before the harness starts the server. |
| `nodetool-mcp serve` fails, but `npx` works | The MCP executable is missing from `PATH` or is an older install. Use `--npx`, or update the global `@nodetool-ai/cli-mcp` package. |
| A generation fails with a missing key | Store the key with `nodetool secrets store <NAME>`. |

## Add other MCP servers to NodeTool

The other direction also works: the NodeTool agent can use the tools of any MCP server, such as Blender, Hugging Face, or a script of your own.

Open **Settings → Integrations → MCP integration → External servers** in the desktop app. Select **Add server** and fill in:

- **ID**: lowercase letters, digits, and `_`, starting with a letter or digit, up to 32 characters. The id must be unique.
- **Name**: the label shown in the list.
- **Connection**: one of two transports.
  - **Command (stdio)**: a command, arguments (one per line), environment variables (one `KEY=value` per line), and an optional working directory. Stdio servers are not available on some hosted deployments, which accept only HTTP servers.
  - **HTTP URL**: an `http` or `https` URL and optional request headers, one `KEY=value` per line. NodeTool tries streamable HTTP and falls back to SSE.

A literal environment or header value is stored encrypted. `${SECRET_NAME}` reads the secret `SECRET_NAME` from your API keys instead.

A server's tools join the agent's toolbelt on the next message, named `mcp_<id>_<tool>`. **Test** connects to a server and lists its tools. **Disable** turns a server off without deleting it. Removing a server takes its tools out of the toolbelt. See [modelcontextprotocol.io](https://modelcontextprotocol.io/) for available MCP servers.

### Use external servers in a workflow

A workflow can call the same servers in two ways. Both reach only your own enabled servers, and a stdio server stays unavailable wherever stdio is.

- **Call MCP Tool node** (`lib.mcp.CallMcpTool`): pick a server and a tool, and the tool's arguments become inputs. The node names one server and one tool, so you chose that call when you built the workflow, and it runs the same way in a background run that nobody watches. A tool that answers with an error fails the node. The outputs are `text`, `result` (the structured content, if any) and `resource_links`. Image content in a result is not passed on.
- **Code node**: import the tools from `@nodetool-ai/sandbox-nodetool/mcp`, for example `import { mcp_home_get_state } from "@nodetool-ai/sandbox-nodetool/mcp"`. Here the code picks the tool at run time, so the run's permission gate applies. A tool its server marks read-only (`readOnlyHint`) runs. Any other tool asks for approval on every call, and a background run has nobody to ask, so the gate denies it. Use the Call MCP Tool node for a write that a background run must make. A Code node that does not mention an MCP tool opens no connection.

Workflow runs reach these servers only on a NodeTool server, not in `nodetool run`. Secrets a server was started with are blanked out of its results and errors. Treat what a tool returns as data from a third party.

