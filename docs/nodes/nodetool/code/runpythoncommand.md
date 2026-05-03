---
layout: page
title: "Run Python Command"
node_type: "nodetool.code.RunPythonCommand"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunPythonCommand`

**Namespace:** `nodetool.code`

## Description

Executes a single Python command and buffers the output.
    python, code, execute, command

    Use cases:
    - Run a single Python script or command
    - Execute Python code with buffered stdout/stderr output
    - One-shot Python execution without streaming

    The command is executed once and the complete output is returned.
    IMPORTANT: Only enabled in non-production environments

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | Python command to execute | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
