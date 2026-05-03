---
layout: page
title: "Run Java Script Command Docker"
node_type: "nodetool.code.RunJavaScriptCommandDocker"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunJavaScriptCommandDocker`

**Namespace:** `nodetool.code`

## Description

Executes a single JavaScript command in Docker and buffers the output.
    javascript, nodejs, code, execute, command, docker

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | JavaScript command to execute | `` |
| image | `enum` | Docker image to use for execution | `node:22-alpine` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
