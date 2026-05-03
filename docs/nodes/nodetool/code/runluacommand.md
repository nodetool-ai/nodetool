---
layout: page
title: "Run Lua Command"
node_type: "nodetool.code.RunLuaCommand"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunLuaCommand`

**Namespace:** `nodetool.code`

## Description

Executes a single Lua command and buffers the output.
    lua, code, execute, command, sandbox

    Use cases:
    - Run a single Lua script or command
    - Execute Lua code with buffered stdout/stderr output
    - One-shot Lua execution without streaming

    The command is executed once and the complete output is returned.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | Lua command to execute | `` |
| executable | `enum` | Lua executable to use | `lua` |
| timeout_seconds | `int` | Max seconds to allow execution before forced stop | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
