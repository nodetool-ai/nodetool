---
layout: page
title: "Filter Dicts Regex"
node_type: "nodetool.list.FilterDictsRegex"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.FilterDictsRegex`

**Namespace:** `nodetool.list`

## Description

Filters a list of dictionaries using regular expressions on specified keys.
    list, filter, regex, dictionary, pattern

    Use cases:
    - Filter dictionaries with values matching complex patterns
    - Search for dictionaries containing emails, dates, or specific formats
    - Advanced text pattern matching across dictionary values

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `List[Dict[Any, Any]]` |  | `[]` |
| key | `str` |  | `` |
| pattern | `str` |  | `` |
| full_match | `bool` |  | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[Dict[Any, Any]]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

