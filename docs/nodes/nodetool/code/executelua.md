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
| code | `any` | Lua code to execute as-is in a restricted environment. Dynamic inputs are provided as variables. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'. | `` |
| executable | `any` | Lua executable to use | `lua` |
| execution_mode | `any` | Execution mode: 'docker' or 'subprocess' | `subprocess` |
| timeout_seconds | `any` | Max seconds to allow execution before forced stop | `10` |
| stdin | `any` | String to write to process stdin before any streaming input. Use newlines to separate lines. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `any` |  |
| stderr | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.

