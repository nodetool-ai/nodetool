---
layout: page
title: "Run Bash Command Docker"
node_type: "nodetool.code.RunBashCommandDocker"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunBashCommandDocker`

**Namespace:** `nodetool.code`

## Description

Executes a single Bash command in Docker and buffers the output.
    bash, shell, code, execute, command, docker

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | Bash command to execute | `` |
| image | `enum` | Docker image to use for execution | `ubuntu:22.04` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
