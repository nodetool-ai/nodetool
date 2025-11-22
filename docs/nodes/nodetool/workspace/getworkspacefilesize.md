---
layout: page
title: "Get Workspace File Size"
node_type: "nodetool.workspace.GetWorkspaceFileSize"
namespace: "nodetool.workspace"
---

**Type:** `nodetool.workspace.GetWorkspaceFileSize`

**Namespace:** `nodetool.workspace`

## Description

Get file size in bytes for a workspace file.
    workspace, file, size, bytes

    Use cases:
    - Check file size before processing
    - Monitor generated file sizes
    - Validate file completeness

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| path | `str` | Relative path to file within workspace | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `int` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.workspace](../) namespace.

