---
layout: page
title: "Integer Input"
node_type: "nodetool.input.IntegerInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.IntegerInput`

**Namespace:** `nodetool.input`

## Description

Accepts an integer (whole number) as a parameter for workflows, typically constrained by a minimum and maximum value.  This input is used for discrete numeric values like counts, indices, or iteration limits.
    input, parameter, integer, number, count, index, whole_number

    Use cases:
    - Specify counts or quantities (e.g., number of items, iterations).
    - Set index values for accessing elements in a list or array.
    - Configure discrete numeric parameters like age, steps, or quantity.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `any` | The parameter name for the workflow. | `` |
| value | `any` |  | `0` |
| description | `any` | The description of the input for the workflow. | `` |
| min | `any` |  | `0` |
| max | `any` |  | `100` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

