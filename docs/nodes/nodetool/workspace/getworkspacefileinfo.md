---
layout: page
title: "Get Workspace File Info"
node_type: "nodetool.workspace.GetWorkspaceFileInfo"
namespace: "nodetool.workspace"
---

**Type:** `nodetool.workspace.GetWorkspaceFileInfo`

**Namespace:** `nodetool.workspace`

## Description

Get information about a file in the workspace.
    workspace, file, info, metadata

    Use cases:
    - Get file size and timestamps
    - Check file type (file vs directory)
    - Inspect file metadata

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| path | `str` | Relative path to file within workspace | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[Any, Any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.workspace](../) namespace.

