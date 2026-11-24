---
layout: page
title: "MCP Tool Reference"
permalink: /developer/mcp-tools
description: "The tools, resources, and prompts NodeTool's MCP server offers, how ids and local connections work, and the mini app protocol behind open_app."
---

**Navigation**: [Docs index](../index.md) | [NodeTool as an MCP Server](../mcp-server.md) → **MCP Tool Reference**

This page is for engineers who call NodeTool's MCP server from their own client or change what it offers. To install the server in a harness, see [NodeTool as an MCP Server](../mcp-server.md). The sandbox tool list is in the [CLI reference](../cli.md#what-the-mcp-server-exposes).

A tool call the harness sends:

```json
{
  "jsonrpc": "2.0", "id": 2, "method": "tools/call",
  "params": { "name": "search_nodes", "arguments": { "query": ["resize"], "n_results": 5 } }
}
```

## Local connections and ids

A *local connection* is the stdio server, or an HTTP `/mcp` request from loopback by the local user of a Local-mode server outside production (`isLocalMcpSession` in `packages/websocket/src/lib/mcp-mount.ts`). A signed-in account on a Supabase or SSO server never gets one, even through a reverse proxy on the same machine. Only a local connection may pass server file paths to `upload_asset`, `download_asset`, and `view_image`, and only a local connection gets `inspect_packs` and `manage_packs`.

Direct tools answer with full 32-character resource ids. Inside `execute_code`, results carry the 12-character prefix of each id instead, to save tokens. Every tool, direct or in the sandbox, accepts either form.

## execute_code and searchTools

Everything beyond the direct tools goes through `execute_code`, which runs sandboxed JavaScript that calls `nodetool.<namespace>.<method>()`. The agent finds a tool with `nodetool.searchTools("query")`. Each hit carries the `import` line to write.

## Direct tools

| Tool | Purpose |
|---|---|
| `execute_code` | Run sandboxed JavaScript that calls the `nodetool.*` modules. The main tool. |
| `view_image` | Return an image as MCP image content so the agent can see the pixels. Takes an asset id, `asset://` URI, public `https://` URL, or `data:` URI. A local connection also accepts an absolute disk path. For a stored asset or an `https://` input, the result also carries a public `url` the chat can display. It shows the image at its stored size, or downscaled to 768 pixels on the long side with `detail: "low"`, and the result reports which. It does not crop. |
| `upload_asset` | Save bytes in your asset library. Takes `content_base64`, or an absolute `file_path` on a local connection. Returns the asset id and URI. |
| `download_asset` | Return a signed public `url` for an asset you own, or write it to an absolute `output_path` on a local connection. It never returns the bytes inline. |
| `list_skills` | List NodeTool skills, the shipped ones and your own, by name and description. Takes an optional `query`. |
| `load_skill` | Return one skill's full instructions by name. |
| `list_directory` | List files and subdirectories in a workspace directory. |
| `download_file` | Download a file from a URL, or from an `asset://` URI, a `/api/storage/` key, or a `data:` URI, into the workspace. |
| `run_subtask` | Hand a task to a child agent that has the NodeTool toolbelt. |
| `list_generations` | List your media generations, newest first, with status, cost and asset ids. Generations an MCP tool call started are included. |
| `get_generation` | Return one generation's record by its `generation_id`. |
| `await_generation` | Wait for a generation started with `background: true` to settle, then return its record with the asset ids. |
| `find_model` | Find a real provider and model id for a capability such as image, video, or speech. |
| `list_providers` | List configured providers, their capabilities, the tool that runs each capability, and `unavailable_reason` when a provider cannot serve calls here. |
| `list_models` | List the models available from the providers you configured. |
| `list_provider_models` | List the language models of one provider. |
| `search_nodes` | Search node types by keyword. |
| `get_node_info` | Return a node type's inputs, outputs, types, and defaults. |
| `list_nodes` | List node types, optionally filtered by namespace. |
| `open_app` | Open one of your mini apps. Takes an app id or its 12-character short id. See [Mini app protocol](#mini-app-protocol). |
| `inspect_packs` | Local connection only. List node packs, say which pack owns a node type, or check install integrity. |
| `manage_packs` | Local connection only. Install, remove, or repair node packs by running the `nodetool packs` CLI. Running servers need a restart afterwards. |

One tool per provider capability is also direct: `generate_text`, `generate_image`, `edit_image`, `segment_image`, `generate_video`, `animate_image`, `generate_video_from_references`, `generate_speech`, `generate_music`, `transcribe_audio`, and `embed_text`. Each takes a `provider` and `model` from `find_model`. Generated media is saved as an asset and the result carries its `asset://` URI. With `background: true` a generation tool answers at once with a `generation_id`. Collect the result with `await_generation`.

`search_nodes`, `get_node_info`, and `list_nodes` are offered only when the session has the node registry loaded.

### Tools that are not direct

`read_file`, `write_file`, `edit_file`, `glob`, `grep`, and `web_search` are not direct tools, because Claude Code and similar clients provide their own (`SDK_NATIVE_TOOL_REPLACEMENTS` in `packages/runtime/src/providers/core-tools.ts`). `browser`, `http_request`, and `todo_write` are also not direct on this server (`MCP_SANDBOX_ONLY_TOOL_NAMES` in `packages/websocket/src/mcp-agent-tools.ts`). All of them stay available inside `execute_code`.

## Tool list updates

The `tools/list` schema of a direct tool and the signature `nodetool.searchTools()` shows inside `execute_code` come from the same capability spec. `packages/websocket/tests/mcp-schema-parity.test.ts` fails when they differ.

A client reads the tool list when it connects and may keep it after that. This server cannot tell a connected client that the list changed. It answers every request as JSON and offers no SSE stream, so `notifications/tools/list_changed` has no channel to travel on, and a session revived after a deploy keeps its id, so the client sees no new handshake. After a server update, remove and re-add the connector, or start a new conversation, to load new parameters. Inside `execute_code` the new parameters work at once.

## Resources and prompts

| Name | Kind | Purpose |
|---|---|---|
| `nodetool://capabilities` | Resource | The modules mounted for the session, every tool an action can call, and each tool's permission category, as JSON. |
| `nodetool://sandbox` | Resource | How to write `execute_code`: the guest contract, blocked globals, unavailable bridges, and worked examples. |
| `ui://nodetool/mini-app.html` | Resource | The mini app renderer, an HTML page of type `text/html;profile=mcp-app` that `open_app` links to. |
| `sandbox-action` | Prompt | A complete `execute_code` body that lists workflows, picks a model, and generates one image. |
| `sandbox-asset` | Prompt | A complete `execute_code` body that lists one asset and fetches its ref. |
| `<skill-name>` | Prompt | One prompt for each skill the user can load: the shipped system skills and the user's own skills. The prompt returns the skill body. The optional `request` argument adds the task. Claude Code shows each prompt as a slash command. |

## Mini app protocol

`open_app` links to the `ui://nodetool/mini-app.html` resource in its `_meta.ui.resourceUri`. A host that supports the [MCP Apps extension](https://modelcontextprotocol.io/extensions/apps/overview) renders it in an iframe and passes it the `open_app` result. Other hosts get a text summary. The code is in `packages/websocket/src/mcp-apps.ts`.

| Part | What it does |
|---|---|
| `ui://nodetool/mini-app.html` | One self-contained page. It draws the widgets the same way an [exported app](../api-reference.md#exporting-an-app-as-a-standalone-project) does, and loads nothing from the network. |
| `run_app_operation` | Starts one operation and waits up to 8 seconds. A short run finishes in this one call. |
| `poll_app_run` | Returns the messages a run produced since the last call, or cancels the run. |

The page calls `run_app_operation` and `poll_app_run` through the host. Both are marked app-only (`_meta.ui.visibility: ["app"]`), so the model does not see them. `upload_asset` stores files that the page's file inputs pick.

Results up to 8 MB per value arrive inline as `data:` URLs. With S3 or Supabase asset storage, a larger asset loads from a signed URL whose origin the page's Content Security Policy lists. On the local file backend, a larger result does not display in the host.

A run is tracked by the server process that started it, so a poll that reaches another replica or a restarted server reports that the run is gone. The run still finishes. Its result is in the app's run history.
