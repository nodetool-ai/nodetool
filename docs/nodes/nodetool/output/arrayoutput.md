---
layout: page
title: "Array Output"
node_type: "nodetool.output.ArrayOutput"
namespace: "nodetool.output"
---

**Type:** `nodetool.output.ArrayOutput`

**Namespace:** `nodetool.output`

## Description

Output node for generic array data, typically numerical ('NPArray').
    array, numerical, list, tensor, vector, matrix

    Use cases:
    - Outputting results from machine learning models (e.g., embeddings, predictions).
    - Representing complex numerical data structures.
    - Passing arrays of numbers between processing steps.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `any` | The parameter name for the workflow. | `` |
| value | `any` |  | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| description | `any` | The description of the output for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.output](../) namespace.

