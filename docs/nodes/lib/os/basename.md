---
layout: page
title: "Basename"
node_type: "lib.os.Basename"
namespace: "lib.os"
---

**Type:** `lib.os.Basename`

**Namespace:** `lib.os`

## Description

Get the base name component of a file path.
    files, path, basename

    Use cases:
    - Extract filename from full path
    - Get file name without directory
    - Process file names independently

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| path | `str` | File path to get basename from | `` |
| remove_extension | `bool` | Remove file extension from basename | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.os](../) namespace.

