---
layout: page
title: "Run Lua Command Docker"
node_type: "nodetool.code.RunLuaCommandDocker"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunLuaCommandDocker`

**Namespace:** `nodetool.code`

## Description

Executes a single Lua command in Docker and buffers the output.
    lua, code, execute, command, sandbox, docker

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | Lua command to execute | `` |
| image | `enum` | Docker image to use for execution | `nickblah/lua:5.2.4-luarocks-ubuntu` |
| timeout_seconds | `int` | Max seconds to allow execution before forced stop | `10` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
