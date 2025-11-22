---
layout: page
title: "Reshape 4 D"
node_type: "lib.numpy.reshaping.Reshape4D"
namespace: "lib.numpy.reshaping"
---

**Type:** `lib.numpy.reshaping.Reshape4D`

**Namespace:** `lib.numpy.reshaping`

## Description

Reshape an array to a 4D shape without changing its data.
    array, reshape, dimensions, batch

    Use cases:
    - Prepare batch data for neural networks
    - Structure spatiotemporal data
    - Format data for 3D image processing with channels

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | The input array to reshape | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| num_rows | `int` | The number of rows | `0` |
| num_cols | `int` | The number of columns | `0` |
| num_depths | `int` | The number of depths | `0` |
| num_channels | `int` | The number of channels | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `np_array` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.numpy.reshaping](../) namespace.

