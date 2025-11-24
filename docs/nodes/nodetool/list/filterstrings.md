---
layout: page
title: "Filter Strings"
node_type: "nodetool.list.FilterStrings"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.FilterStrings`

**Namespace:** `nodetool.list`

## Description

Filters a list of strings based on various criteria.
    list, filter, strings, text

    Use cases:
    - Filter strings by length
    - Filter strings containing specific text
    - Filter strings by prefix/suffix
    - Filter strings using regex patterns

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `List[str]` |  | `[]` |
| filter_type | `Enum['contains', 'starts_with', 'ends_with', 'length_greater', 'length_less', 'exact_length']` | The type of filter to apply | `contains` |
| criteria | `str` | The filtering criteria (text to match or length as string) | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[str]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

