---
layout: page
title: "Run Shell Command Docker"
node_type: "nodetool.code.RunShellCommandDocker"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunShellCommandDocker`

**Namespace:** `nodetool.code`

## Description

Executes a single shell command in Docker and buffers the output.
    command, execute, shell, bash, sh, docker

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | Shell command to execute | `` |
| image | `enum` | Docker image to use for execution | `bash:5.2` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
