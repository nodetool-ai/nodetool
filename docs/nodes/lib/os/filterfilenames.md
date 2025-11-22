---
layout: page
title: "Filter File Names"
node_type: "lib.os.FilterFileNames"
namespace: "lib.os"
---

**Type:** `lib.os.FilterFileNames`

**Namespace:** `lib.os`

## Description

Filter a list of filenames using Unix shell-style wildcards.
    files, pattern, filter, list

    Use cases:
    - Filter multiple files by pattern
    - Batch process files matching criteria
    - Select files by extension

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| filenames | `List[str]` | list of filenames to filter | `[]` |
| pattern | `str` | Pattern to filter by (e.g. *.txt, data_*.csv) | `*` |
| case_sensitive | `bool` | Whether the pattern matching should be case-sensitive | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[str]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.os](../) namespace.

