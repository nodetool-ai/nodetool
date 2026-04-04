---
layout: page
title: "Arg Max Array"
node_type: "lib.array.statistics.ArgMaxArray"
namespace: "lib.array.statistics"
---

**Type:** `lib.array.statistics.ArgMaxArray`

**Namespace:** `lib.array.statistics`

## Description

Find indices of maximum values along a specified axis of a array.
    array, argmax, index, maximum

    Use cases:
    - Determine winning classes in classification tasks
    - Find peaks in signal processing
    - Locate best-performing items in datasets

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | Input array | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| axis | `Optional[int]` | Axis along which to find maximum indices | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `(np_array | int)` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.array.statistics](../) namespace.

