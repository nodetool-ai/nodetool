---
layout: page
title: "Max Array"
node_type: "lib.array.statistics.MaxArray"
namespace: "lib.array.statistics"
---

**Type:** `lib.array.statistics.MaxArray`

**Namespace:** `lib.array.statistics`

## Description

Compute the maximum value along a specified axis of a array.
    array, maximum, reduction, statistics

    Use cases:
    - Find peak values in time series data
    - Implement max pooling in neural networks
    - Determine highest scores across multiple categories

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | Input array | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| axis | `Optional[int]` | Axis along which to compute maximum | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `(np_array | float | int)` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.array.statistics](../) namespace.

