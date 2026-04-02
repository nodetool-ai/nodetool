---
layout: page
title: "Sum Array"
node_type: "lib.array.statistics.SumArray"
namespace: "lib.array.statistics"
---

**Type:** `lib.array.statistics.SumArray`

**Namespace:** `lib.array.statistics`

## Description

Calculate the sum of values along a specified axis of a array.
    array, summation, reduction, statistics

    Use cases:
    - Compute total values across categories
    - Implement sum pooling in neural networks
    - Calculate cumulative metrics in time series data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | Input array | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| axis | `Optional[int]` | Axis along which to compute sum | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `(np_array | float | int)` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.array.statistics](../) namespace.

