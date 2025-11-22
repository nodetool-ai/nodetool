---
layout: page
title: "File Name Match"
node_type: "lib.os.FileNameMatch"
namespace: "lib.os"
---

**Type:** `lib.os.FileNameMatch`

**Namespace:** `lib.os`

## Description

Match a filename against a pattern using Unix shell-style wildcards.
    files, pattern, match, filter

    Use cases:
    - Filter files by name pattern
    - Validate file naming conventions
    - Match file extensions

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| filename | `str` | Filename to check | `` |
| pattern | `str` | Pattern to match against (e.g. *.txt, data_*.csv) | `*` |
| case_sensitive | `bool` | Whether the pattern matching should be case-sensitive | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.os](../) namespace.

