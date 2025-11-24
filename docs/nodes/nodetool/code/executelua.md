---
layout: page
title: "Execute Lua"
node_type: "nodetool.code.ExecuteLua"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.ExecuteLua`

**Namespace:** `nodetool.code`

## Description

Executes Lua code with a local sandbox (no Docker).
    lua, code, execute, sandbox

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| code | `str` | Lua code to execute as-is in a restricted environment. Dynamic inputs are provided as variables. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'. | `` |
| executable | `Enum['lua', 'luajit']` | Lua executable to use | `lua` |
| execution_mode | `Enum['docker', 'subprocess']` | Execution mode: 'docker' or 'subprocess' | `subprocess` |
| timeout_seconds | `int` | Max seconds to allow execution before forced stop | `10` |
| stdin | `str` | String to write to process stdin before any streaming input. Use newlines to separate lines. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.

