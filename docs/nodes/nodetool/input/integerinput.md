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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `int` |  | `0` |
| description | `str` | The description of the input for the workflow. | `` |
| min | `int` |  | `0` |
| max | `int` |  | `99999` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.
