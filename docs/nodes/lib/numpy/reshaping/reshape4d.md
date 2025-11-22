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
| values | `any` | The input array to reshape | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| num_rows | `any` | The number of rows | `0` |
| num_cols | `any` | The number of columns | `0` |
| num_depths | `any` | The number of depths | `0` |
| num_channels | `any` | The number of channels | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.numpy.reshaping](../) namespace.

