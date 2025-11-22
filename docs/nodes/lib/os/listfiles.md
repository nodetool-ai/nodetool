---
layout: page
title: "List Files"
node_type: "lib.os.ListFiles"
namespace: "lib.os"
---

**Type:** `lib.os.ListFiles`

**Namespace:** `lib.os`

## Description

list files in a directory matching a pattern.
    files, list, directory

    Use cases:
    - Get files for batch processing
    - Filter files by extension or pattern

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| folder | `str` | Directory to scan | `~` |
| pattern | `str` | File pattern to match (e.g. *.txt) | `*` |
| include_subdirectories | `bool` | Search subdirectories | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| file | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.os](../) namespace.

