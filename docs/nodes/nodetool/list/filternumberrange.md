---
layout: page
title: "Filter Number Range"
node_type: "nodetool.list.FilterNumberRange"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.FilterNumberRange`

**Namespace:** `nodetool.list`

## Description

Filters a list of numbers to find values within a specified range.
    list, filter, numbers, range, between

    Use cases:
    - Find numbers within a specific range
    - Filter data points within bounds
    - Implement range-based filtering

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `List[float]` |  | `[]` |
| min_value | `float` |  | `0` |
| max_value | `float` |  | `0` |
| inclusive | `bool` |  | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[float]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

