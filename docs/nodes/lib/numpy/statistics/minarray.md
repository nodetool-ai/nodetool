---
layout: page
title: "Min Array"
node_type: "lib.array.statistics.MinArray"
namespace: "lib.array.statistics"
---

**Type:** `lib.array.statistics.MinArray`

**Namespace:** `lib.array.statistics`

## Description

Calculate the minimum value along a specified axis of a array.
    array, minimum, reduction, statistics

    Use cases:
    - Find lowest values in datasets
    - Implement min pooling in neural networks
    - Determine minimum thresholds across categories

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | Input array | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| axis | `Optional[int]` | Axis along which to compute minimum | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `(np_array | float | int)` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.array.statistics](../) namespace.

