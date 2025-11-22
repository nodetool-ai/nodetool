---
layout: page
title: "Filter Dicts By Range"
node_type: "nodetool.list.FilterDictsByRange"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.FilterDictsByRange`

**Namespace:** `nodetool.list`

## Description

Filters a list of dictionaries based on a numeric range for a specified key.
    list, filter, dictionary, range, between

    Use cases:
    - Filter records based on numeric ranges (e.g., price range, age range)
    - Find entries with values within specified bounds
    - Filter data sets based on numeric criteria

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `List[Dict[Any, Any]]` |  | `[]` |
| key | `str` | The dictionary key to check for the range | `` |
| min_value | `float` | The minimum value (inclusive) of the range | `0` |
| max_value | `float` | The maximum value (inclusive) of the range | `0` |
| inclusive | `bool` | If True, includes the min and max values in the results | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[Dict[Any, Any]]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

