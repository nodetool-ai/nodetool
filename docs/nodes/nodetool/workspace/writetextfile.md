---
layout: page
title: "Write Text File"
node_type: "nodetool.workspace.WriteTextFile"
namespace: "nodetool.workspace"
---

**Type:** `nodetool.workspace.WriteTextFile`

**Namespace:** `nodetool.workspace`

## Description

Write text to a file in the workspace.
    workspace, file, write, text, save

    Use cases:
    - Save generated text to workspace
    - Create configuration files
    - Export processed text data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| path | `any` | Relative path to file within workspace | `` |
| content | `any` | Text content to write | `` |
| encoding | `any` | Text encoding (utf-8, ascii, etc.) | `utf-8` |
| append | `any` | Append to file instead of overwriting | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.workspace](../) namespace.

