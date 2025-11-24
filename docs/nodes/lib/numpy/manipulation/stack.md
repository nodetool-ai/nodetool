---
layout: page
title: "Stack"
node_type: "lib.numpy.manipulation.Stack"
namespace: "lib.numpy.manipulation"
---

**Type:** `lib.numpy.manipulation.Stack`

**Namespace:** `lib.numpy.manipulation`

## Description

Stack multiple arrays along a specified axis.
    array, stack, concatenate, join, merge, axis

    Use cases:
    - Combine multiple 2D arrays into a 3D array
    - Stack time series data from multiple sources
    - Merge feature vectors for machine learning models

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| arrays | `List[np_array]` | Arrays to stack | `[]` |
| axis | `int` | The axis to stack along. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `np_array` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.numpy.manipulation](../) namespace.

