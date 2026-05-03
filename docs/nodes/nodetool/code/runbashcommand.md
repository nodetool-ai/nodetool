---
layout: page
title: "Run Bash Command"
node_type: "nodetool.code.RunBashCommand"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunBashCommand`

**Namespace:** `nodetool.code`

## Description

Executes a single Bash command and buffers the output.
    bash, shell, code, execute, command

    Use cases:
    - Run a single Bash script or command
    - Execute shell commands with buffered stdout/stderr output
    - One-shot Bash execution without streaming

    The command is executed once and the complete output is returned.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | Bash command to execute | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
