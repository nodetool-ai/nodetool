---
layout: page
title: "Run Java Script Command"
node_type: "nodetool.code.RunJavaScriptCommand"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunJavaScriptCommand`

**Namespace:** `nodetool.code`

## Description

Executes a single JavaScript command and buffers the output.
    javascript, nodejs, code, execute, command

    Use cases:
    - Run a single JavaScript script or command
    - Execute JavaScript code with buffered stdout/stderr output
    - One-shot JavaScript execution without streaming

    The command is executed once and the complete output is returned.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | JavaScript command to execute | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
