---
layout: page
title: "Reshape 2 D"
node_type: "lib.array.reshaping.Reshape2D"
namespace: "lib.array.reshaping"
---

**Type:** `lib.array.reshaping.Reshape2D`

**Namespace:** `lib.array.reshaping`

## Description

Reshape an array to a new shape without changing its data.
    array, reshape, dimensions, structure

    Use cases:
    - Convert between different dimensional representations
    - Prepare data for specific model architectures
    - Flatten or unflatten arrays

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | The input array to reshape | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| num_rows | `int` | The number of rows | `0` |
| num_cols | `int` | The number of columns | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `np_array` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.array.reshaping](../) namespace.

