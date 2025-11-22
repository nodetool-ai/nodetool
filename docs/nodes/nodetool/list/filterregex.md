---
layout: page
title: "Filter Regex"
node_type: "nodetool.list.FilterRegex"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.FilterRegex`

**Namespace:** `nodetool.list`

## Description

Filters a list of strings using regular expressions.
    list, filter, regex, pattern, text

    Use cases:
    - Filter strings using complex patterns
    - Extract strings matching specific formats (emails, dates, etc.)
    - Advanced text pattern matching

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `any` |  | `[]` |
| pattern | `any` | The regular expression pattern to match against. | `` |
| full_match | `any` | Whether to match the entire string or find pattern anywhere in string | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

