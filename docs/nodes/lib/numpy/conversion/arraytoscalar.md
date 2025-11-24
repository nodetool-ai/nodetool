---
layout: page
title: "Array To Scalar"
node_type: "lib.numpy.conversion.ArrayToScalar"
namespace: "lib.numpy.conversion"
---

**Type:** `lib.numpy.conversion.ArrayToScalar`

**Namespace:** `lib.numpy.conversion`

## Description

Convert a single-element array to a scalar value.
    array, scalar, conversion, type

    Use cases:
    - Extract final results from array computations
    - Prepare values for non-array operations
    - Simplify output for human-readable results

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | Array to convert to scalar | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `(float | int)` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.numpy.conversion](../) namespace.

