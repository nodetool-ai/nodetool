---
layout: page
title: "Split Array"
node_type: "lib.numpy.manipulation.SplitArray"
namespace: "lib.numpy.manipulation"
---

**Type:** `lib.numpy.manipulation.SplitArray`

**Namespace:** `lib.numpy.manipulation`

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
| values | `any` | The input array to split | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| num_splits | `any` | Number of equal splits to create | `0` |
| axis | `any` | Axis along which to split | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.numpy.manipulation](../) namespace.

