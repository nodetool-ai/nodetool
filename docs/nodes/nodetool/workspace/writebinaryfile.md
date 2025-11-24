---
layout: page
title: "Write Binary File"
node_type: "nodetool.workspace.WriteBinaryFile"
namespace: "nodetool.workspace"
---

**Type:** `nodetool.workspace.WriteBinaryFile`

**Namespace:** `nodetool.workspace`

## Description

Write binary data (base64-encoded) to a file in the workspace.
    workspace, file, write, binary, save

    Use cases:
    - Save binary data to workspace
    - Write decoded base64 data
    - Export binary results

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| path | `str` | Relative path to file within workspace | `` |
| content | `str` | Base64-encoded binary content to write | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.workspace](../) namespace.

