---
layout: page
title: "SandboxFile"
node_type: "nodetool.sandbox.SandboxFile"
namespace: "nodetool.sandbox"
---

**Type:** `nodetool.sandbox.SandboxFile`

**Namespace:** `nodetool.sandbox`

## Description

Read, write, search, and replace files inside a sandbox session.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| workspace_dir | `str` | Optional sandbox workspace directory. | `` |
| action | `enum` | File action to execute. | `read` |
| params | `dict` | Action parameters validated by the sandbox file tool. | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict[str, any]` |  |

## Related Nodes

Browse other nodes in the [nodetool.sandbox](../) namespace.
