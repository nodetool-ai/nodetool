---
layout: page
title: "Slice Array"
node_type: "lib.numpy.manipulation.SliceArray"
namespace: "lib.numpy.manipulation"
---

**Type:** `lib.numpy.manipulation.SliceArray`

**Namespace:** `lib.numpy.manipulation`

## Description

Extract a slice of an array along a specified axis.
    array, slice, subset, index

    Use cases:
    - Extract specific time periods from time series data
    - Select subset of features from datasets
    - Create sliding windows over sequential data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | The input array to slice | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| start | `int` | Starting index (inclusive) | `0` |
| stop | `int` | Ending index (exclusive) | `0` |
| step | `int` | Step size between elements | `1` |
| axis | `int` | Axis along which to slice | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `np_array` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.numpy.manipulation](../) namespace.

