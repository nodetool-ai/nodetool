---
layout: page
title: "Run Ruby Command"
node_type: "nodetool.code.RunRubyCommand"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunRubyCommand`

**Namespace:** `nodetool.code`

## Description

Executes a single Ruby command and buffers the output.
    ruby, code, execute, command

    Use cases:
    - Run a single Ruby script or command
    - Execute Ruby code with buffered stdout/stderr output
    - One-shot Ruby execution without streaming

    The command is executed once and the complete output is returned.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | Ruby command to execute | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
