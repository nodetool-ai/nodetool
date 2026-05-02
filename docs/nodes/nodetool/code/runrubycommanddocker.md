---
layout: page
title: "Run Ruby Command Docker"
node_type: "nodetool.code.RunRubyCommandDocker"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.RunRubyCommandDocker`

**Namespace:** `nodetool.code`

## Description

Executes a single Ruby command in Docker and buffers the output.
    ruby, code, execute, command, docker

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | Ruby command to execute | `` |
| image | `enum` | Docker image to use for execution | `ruby:3.3-alpine` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
