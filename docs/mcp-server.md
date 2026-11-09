---
layout: page
title: "NodeTool as an MCP Server"
permalink: /mcp-server
description: "Use NodeTool from Claude Code, Codex, OpenCode, Cursor, or any MCP client. One command registers the server. The desktop app is optional."
---

`nodetool-mcp serve` starts NodeTool as a Model Context Protocol (MCP) server over stdio. A harness such as Claude Code, Codex, or OpenCode launches it and calls the tools below. The desktop app is optional.

```bash
npx -y @nodetool-ai/cli-mcp install
```

The command writes this entry into each client it finds (Node.js 22 or later):

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

A tool call the harness then sends:

```json
{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": { "name": "search_nodes", "arguments": { "query": ["resize"], "n_results": 5 } }
}
```

Restart the harness, then ask it: "Use NodeTool to list my workflows."

## Install

> **Runs:** locally over stdio, or against a running NodeTool server over HTTP. **Needs:** Node.js 22 or later. Generation tools need provider keys (see [Provider keys](#provider-keys)).
{: .callout-note}

Or install the executable globally:

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

The entry starts `nodetool-mcp serve` over stdio. The command is `nodetool-mcp` when the CLI is on `PATH`, and `npx -y @nodetool-ai/cli-mcp serve` when it is not. Add `--npx` to always use `npx`.

| Client | File | Scope |
|---|---|---|
| Claude Code | `~/.claude.json`, key `mcpServers` | User scope, every project |
| Codex | `~/.codex/config.toml`, block `[mcp_servers.nodetool]` | Every session |
| OpenCode | `~/.config/opencode/opencode.json`, key `mcp` | Every session |

Codex gets a 120-second start timeout and a 900-second tool timeout, because a
video generation can run for minutes. OpenCode gets the 120-second timeout.

Earlier versions wrote the Claude Code entry under `projects["<home>"]`, so it
worked only in sessions started in the home directory. A new install moves that
entry to the user scope.

## Other clients

Print the `mcpServers` block above for Cursor, Claude Desktop, Windsurf, or any client that reads that JSON:

```bash
nodetool-mcp config
```

To register the server with Claude Code by hand, run:

```bash
claude mcp add --scope user nodetool -- npx -y @nodetool-ai/cli-mcp serve
```

Claude Desktop also installs the bundled extension from Studio: open
**Settings → MCP Servers → Install Extension**.

## Provider keys

Store a key once in the NodeTool secret store:

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

`nodetool-mcp serve` checks for a running classic API server on `127.0.0.1` at
port 7777 (or `PORT`), over HTTPS when `TLS_CERT` and `TLS_KEY` are set. When
one answers its MCP handshake, the stdio process forwards every request to it.
Actions then run in that process, and an open editor shows the agent's changes
as they happen.

When no server answers, `mcp serve` runs its own MCP server over the default
NodeTool data directory. The agent keeps full access to workflows, assets, and
generation.

To connect a client to a running server over HTTP instead, install with
`--http`. That entry works only while the server runs:

```bash
nodetool-mcp install --http                       # http://127.0.0.1:7777/mcp
nodetool-mcp install --url http://127.0.0.1:8000/mcp
```

For a NodeTool server on another machine, create an access token in
**Settings → MCP Servers → Connect an agent remotely**. See
[MCP on a production server](mcp-production.md) for the server side.

## What the agent gets

Everything beyond the direct tools goes through `execute_code`, which runs sandboxed JavaScript that calls `nodetool.<namespace>.<method>()`. The agent finds a tool with `nodetool.searchTools("query")`. The full list of sandbox tools is in the [CLI reference](cli.md#what-the-mcp-server-exposes).

### Direct tools

| Tool | Purpose |
|---|---|
| `execute_code` | Run sandboxed JavaScript that calls the `nodetool.*` modules. The main tool. |
| `view_image` | Return an image as MCP image content so the agent can see the pixels. Takes an asset id, `asset://` URI, public `https://` URL, or `data:` URI. A local connection also accepts an absolute disk path. |
| `upload_asset` | Save bytes in your asset library. Takes `content_base64`, or an absolute `file_path` on a local connection. Returns the asset id and URI. |
| `download_asset` | Return an asset you own as base64, or write it to an absolute `output_path` on a local connection. |
| `list_directory` | List files and subdirectories in a workspace directory. |
| `download_file` | Download a file from a URL, or from an `asset://` URI, a `/api/storage/` key, or a `data:` URI, into the workspace. |
| `run_subtask` | Hand a task to a child agent that has the NodeTool toolbelt. |
| `find_model` | Find a real provider and model id for a capability such as image, video, or speech. |
| `list_providers` | List configured providers, their capabilities, the tool that runs each capability, and `unavailable_reason` when a provider cannot serve calls here. |
| `list_models` | List the models available from the providers you configured. |
| `list_provider_models` | List the language models of one provider. |
| `search_nodes` | Search node types by keyword. |
| `get_node_info` | Return a node type's inputs, outputs, types, and defaults. |
| `list_nodes` | List node types, optionally filtered by namespace. |
| `open_app` | Open one of your mini apps. Hosts that support MCP Apps show the app's screen in the conversation. See [Mini apps in the host](#mini-apps-in-the-host). |

One tool per provider capability is also direct: `generate_text`, `generate_image`, `edit_image`, `segment_image`, `generate_video`, `animate_image`, `generate_video_from_references`, `generate_speech`, `generate_music`, `transcribe_audio`, and `embed_text`. Each takes a `provider` and `model` from `find_model`. Generated media is saved as an asset and the result carries its `asset://` URI.

`search_nodes`, `get_node_info`, and `list_nodes` are offered only when the session has the node registry loaded. `read_file`, `write_file`, `edit_file`, `glob`, `grep`, and `web_search` are not direct tools, because Claude Code and similar clients provide their own. `browser`, `http_request`, and `todo_write` are also not direct on this server. All of them stay available inside `execute_code`.

### Resources and prompts

| Name | Kind | Purpose |
|---|---|---|
| `nodetool://capabilities` | Resource | The modules mounted for the session, every tool an action can call, and each tool's permission category, as JSON. |
| `nodetool://sandbox` | Resource | How to write `execute_code`: the guest contract, blocked globals, unavailable bridges, and worked examples. |
| `ui://nodetool/mini-app.html` | Resource | The mini app renderer, an HTML page of type `text/html;profile=mcp-app` that `open_app` links to. |
| `sandbox-action` | Prompt | A complete `execute_code` body that lists workflows, picks a model, and generates one image. |
| `sandbox-asset` | Prompt | A complete `execute_code` body that lists one asset and fetches its ref. |
| `<skill-name>` | Prompt | One prompt for each skill the user can load: the shipped system skills and the user's own skills. The prompt returns the skill body. The optional `request` argument adds the task. Claude Code shows each prompt as a slash command. |

## Mini apps in the host

`open_app` takes an app id or its 12-character short id. In a host that supports
the [MCP Apps extension](https://modelcontextprotocol.io/extensions/apps/overview),
the app's screen appears in the conversation. The user fills its fields and
presses its buttons there. Other hosts get a text summary of the app and its
operations.

The screen is the app's default working instance, the same one **Run** opens
in Studio. It runs the released version when the app has one, otherwise the
draft. Each run is an app run with origin `agent`: the app's spend budget
applies, and the run appears in the app's run history.

| Part | What it does |
|---|---|
| `ui://nodetool/mini-app.html` | One self-contained page. It draws the widgets the same way an [exported app](api-reference.md#exporting-an-app-as-a-standalone-project) does, and loads nothing from the network. |
| `run_app_operation` | Starts one operation and waits up to 8 seconds. A short run finishes in this one call. |
| `poll_app_run` | Returns the messages a run produced since the last call, or cancels the run. |

The page calls `run_app_operation` and `poll_app_run` through the host. Both are
marked app-only (`_meta.ui.visibility: ["app"]`), so the model does not see them.
`upload_asset` stores files that the page's file inputs pick.

Results up to 8 MB per value arrive inline as `data:` URLs. With S3 or Supabase
asset storage, a larger asset loads from a signed URL whose origin the page's
Content Security Policy lists. On the local file backend, a larger result does
not display in the host. Model pickers offer the models the app's own graphs
use. Widgets that edit NodeTool documents, such as Storyboard and Timeline,
show a note that they work only in NodeTool.

A run is tracked by the server process that started it. When a poll reaches a
different replica or a restarted server, the page reports that the run is gone.
The run still finishes, and its result is in the app's run history in Studio.

## Troubleshooting

| Symptom | Fix |
|---|---|
| The harness shows the server as failed | Run `nodetool-mcp status --check`. It starts each registered server and prints the error. |
| `npm error could not determine executable to run` | Use `npx -y @nodetool-ai/cli-mcp install`. This package supplies one executable, which npm selects automatically. |
| The first start times out | Run `nodetool-mcp install` again. It fills the `npx` cache before the harness starts the server. |
| `nodetool-mcp serve` fails, but `npx` works | The MCP executable is missing from `PATH` or is an older install. Use `--npx`, or update the global `@nodetool-ai/cli-mcp` package. |
| A generation fails with a missing key | Store the key with `nodetool secrets store <NAME>`. |
