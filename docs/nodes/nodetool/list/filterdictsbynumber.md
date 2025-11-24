---
layout: page
title: "Filter Dicts By Number"
node_type: "nodetool.list.FilterDictsByNumber"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.FilterDictsByNumber`

**Namespace:** `nodetool.list`

## Description

Filters a list of dictionaries based on numeric values for a specified key.
    list, filter, dictionary, numbers, numeric

    Use cases:
    - Filter dictionaries by numeric comparisons (greater than, less than, equal to)
    - Filter records with even/odd numeric values
    - Filter entries with positive/negative numbers

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `List[Dict[Any, Any]]` |  | `[]` |
| key | `str` |  | `` |
| filter_type | `Enum['greater_than', 'less_than', 'equal_to', 'even', 'odd', 'positive', 'negative']` |  | `greater_than` |
| value | `Optional[float]` |  | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[Dict[Any, Any]]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

