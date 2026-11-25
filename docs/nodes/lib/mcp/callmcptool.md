---
layout: page
title: "Call MCP Tool"
node_type: "lib.mcp.CallMcpTool"
namespace: "lib.mcp"
---

**Type:** `lib.mcp.CallMcpTool`

**Namespace:** `lib.mcp`

## Description

Call a tool on an external MCP server you configured in Settings.
    mcp, tool, n8n, home assistant, obsidian, integration, server

    Use cases:
    - Trigger an n8n or Home Assistant action from a workflow
    - Read or write notes through an Obsidian MCP server
    - Run a local script that speaks MCP

    The node runs exactly the server and tool named here, also in a background run. Image content in a tool result is not passed on.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| server | `str` | Id of an external MCP server from Settings, for example n8n. | `` |
| tool | `str` | Name of the tool on that server, as the server lists it. | `` |
| input_schema | `dict` | JSON Schema of the tool's arguments. The editor fills it when you pick a tool. Each property becomes an input. | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| result | `any` |  |
| resource_links | `list[dict[str, any]]` |  |

## Related Nodes

Browse other nodes in the [lib.mcp](./) namespace.
