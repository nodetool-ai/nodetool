---
layout: page
title: "Arg Min Array"
node_type: "lib.numpy.statistics.ArgMinArray"
namespace: "lib.numpy.statistics"
---

**Type:** `lib.numpy.statistics.ArgMinArray`

**Namespace:** `lib.numpy.statistics`

## Description

Find indices of minimum values along a specified axis of a array.
    array, argmin, index, minimum

    Use cases:
    - Locate lowest-performing items in datasets
    - Find troughs in signal processing
    - Determine least likely classes in classification tasks

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | Input array | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| axis | `Optional[int]` | Axis along which to find minimum indices | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `(np_array | int)` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.numpy.statistics](../) namespace.

