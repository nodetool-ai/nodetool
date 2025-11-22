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
| folder | `any` | Directory to scan | `~` |
| pattern | `any` | File pattern to match (e.g. *.txt) | `*` |
| include_subdirectories | `any` | Search subdirectories | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| file | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.os](../) namespace.

