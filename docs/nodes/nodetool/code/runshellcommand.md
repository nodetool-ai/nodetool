---
layout: page
title: "Run Shell Command"
node_type: "nodetool.code.RunShellCommand"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunShellCommand`

**Namespace:** `nodetool.code`

## Description

Executes a single shell command and buffers the output.
    command, execute, shell, bash, sh

    Use cases:
    - Run a single shell command
    - Execute shell commands with buffered stdout/stderr output
    - One-shot command execution without streaming

    The command is executed once and the complete output is returned.
    IMPORTANT: Only enabled in non-production environments

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | Shell command to execute | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
