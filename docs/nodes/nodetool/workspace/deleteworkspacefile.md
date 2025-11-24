---
layout: page
title: "Delete Workspace File"
node_type: "nodetool.workspace.DeleteWorkspaceFile"
namespace: "nodetool.workspace"
---

**Type:** `nodetool.workspace.DeleteWorkspaceFile`

**Namespace:** `nodetool.workspace`

## Description

Delete a file or directory from the workspace.
    workspace, file, delete, remove

    Use cases:
    - Clean up temporary files
    - Remove processed files
    - Clear workspace data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| path | `str` | Relative path to file or directory within workspace | `` |
| recursive | `bool` | Delete directories recursively | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `none` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.workspace](../) namespace.

