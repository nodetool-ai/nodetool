---
layout: page
title: "List Workspace Files"
node_type: "nodetool.workspace.ListWorkspaceFiles"
namespace: "nodetool.workspace"
---

**Type:** `nodetool.workspace.ListWorkspaceFiles`

**Namespace:** `nodetool.workspace`

## Description

List files in the workspace directory matching a pattern.
    workspace, files, list, directory

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| path | `str` | Relative path within workspace (use . for workspace root) | `.` |
| pattern | `str` | File pattern to match (e.g. *.txt, *.json) | `*` |
| recursive | `bool` | Search subdirectories recursively | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| file | `str` |  |
| files | `list` |  |

## Related Nodes

Browse other nodes in the [nodetool.workspace](../) namespace.
