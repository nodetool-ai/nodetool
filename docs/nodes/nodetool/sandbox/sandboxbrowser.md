---
layout: page
title: "SandboxBrowser"
node_type: "nodetool.sandbox.SandboxBrowser"
namespace: "nodetool.sandbox"
---

**Type:** `nodetool.sandbox.SandboxBrowser`

**Namespace:** `nodetool.sandbox`

## Description

Control the sandbox browser (navigate, inspect, click, input, and console actions).

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| workspace_dir | `str` | Optional sandbox workspace directory. | `` |
| action | `enum` | Browser action to execute. | `view` |
| params | `dict` | Action parameters validated by the sandbox browser tool. | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict[str, any]` |  |

## Related Nodes

Browse other nodes in the [nodetool.sandbox](../) namespace.
