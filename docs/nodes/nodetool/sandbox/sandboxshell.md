---
layout: page
title: "SandboxShell"
node_type: "nodetool.sandbox.SandboxShell"
namespace: "nodetool.sandbox"
---

**Type:** `nodetool.sandbox.SandboxShell`

**Namespace:** `nodetool.sandbox`

## Description

Execute shell commands in an isolated sandbox session.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| workspace_dir | `str` | Optional sandbox workspace directory. | `` |
| command | `str` | Shell command to execute in the sandbox. | `` |
| wait_seconds | `float` | If greater than 0, wait this long for output after launching command. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |
| running | `bool` |  |
| exit_code | `union[int, none]` |  |
| timed_out | `bool` |  |

## Related Nodes

Browse other nodes in the [nodetool.sandbox](../) namespace.
