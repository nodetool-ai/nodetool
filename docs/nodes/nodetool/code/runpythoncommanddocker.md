---
layout: page
title: "Run Python Command Docker"
node_type: "nodetool.code.RunPythonCommandDocker"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunPythonCommandDocker`

**Namespace:** `nodetool.code`

## Description

Executes a single Python command in Docker and buffers the output.
    python, code, execute, command, docker

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | Python command to execute | `` |
| image | `enum` | Docker image to use for execution | `python:3.11-slim` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
