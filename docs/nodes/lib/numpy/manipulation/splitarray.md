---
layout: page
title: "Split Array"
node_type: "lib.array.manipulation.SplitArray"
namespace: "lib.array.manipulation"
---

**Type:** `lib.array.manipulation.SplitArray`

**Namespace:** `lib.array.manipulation`

## Description

Split an array into multiple sub-arrays along a specified axis.
    array, split, divide, partition

    Use cases:
    - Divide datasets into training/validation splits
    - Create batches from large arrays
    - Separate multi-channel data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | The input array to split | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| num_splits | `int` | Number of equal splits to create | `0` |
| axis | `int` | Axis along which to split | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[np_array]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.array.manipulation](../) namespace.

