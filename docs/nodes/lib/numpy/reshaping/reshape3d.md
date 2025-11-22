---
layout: page
title: "Reshape 3 D"
node_type: "lib.numpy.reshaping.Reshape3D"
namespace: "lib.numpy.reshaping"
---

**Type:** `lib.numpy.reshaping.Reshape3D`

**Namespace:** `lib.numpy.reshaping`

## Description

Reshape an array to a 3D shape without changing its data.
    array, reshape, dimensions, volume

    Use cases:
    - Convert data for 3D visualization
    - Prepare image data with channels
    - Structure data for 3D convolutions

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `any` | The input array to reshape | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| num_rows | `any` | The number of rows | `0` |
| num_cols | `any` | The number of columns | `0` |
| num_depths | `any` | The number of depths | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.numpy.reshaping](../) namespace.

