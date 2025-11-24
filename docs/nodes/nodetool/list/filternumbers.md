---
layout: page
title: "Filter Numbers"
node_type: "nodetool.list.FilterNumbers"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.FilterNumbers`

**Namespace:** `nodetool.list`

## Description

Filters a list of numbers based on various numerical conditions.
    list, filter, numbers, numeric

    Use cases:
    - Filter numbers by comparison (greater than, less than, equal to)
    - Filter even/odd numbers
    - Filter positive/negative numbers

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `List[float]` |  | `[]` |
| filter_type | `Enum['greater_than', 'less_than', 'equal_to', 'even', 'odd', 'positive', 'negative']` | The type of filter to apply | `greater_than` |
| value | `Optional[float]` | The comparison value (for greater_than, less_than, equal_to) | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[float]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

