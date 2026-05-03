---
layout: page
title: "List Documents"
node_type: "nodetool.document.ListDocuments"
namespace: "nodetool.document"
---

**Type:** `nodetool.document.ListDocuments`

**Namespace:** `nodetool.document`

## Description

List documents in a directory.
    files, list, directory

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| folder | `str` | Directory to scan | `~` |
| pattern | `str` | File pattern to match (e.g. *.txt) | `*` |
| recursive | `bool` | Search subdirectories | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| document | `document` |  |
| documents | `list` |  |

## Related Nodes

Browse other nodes in the [nodetool.document](../) namespace.
