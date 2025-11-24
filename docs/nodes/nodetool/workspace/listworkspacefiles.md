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

    Use cases:
    - Get files for batch processing within workspace
    - Filter workspace files by extension or pattern
    - Discover generated files in workspace

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| path | `str` | Relative path within workspace (use . for workspace root) | `.` |
| pattern | `str` | File pattern to match (e.g. *.txt, *.json) | `*` |
| recursive | `bool` | Search subdirectories recursively | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| file | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.workspace](../) namespace.

