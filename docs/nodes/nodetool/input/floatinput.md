---
layout: page
title: "Float Input"
node_type: "nodetool.input.FloatInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.FloatInput`

**Namespace:** `nodetool.input`

## Description

Accepts a floating-point number as a parameter for workflows, typically constrained by a minimum and maximum value.  This input allows for precise numeric settings, such as adjustments, scores, or any value requiring decimal precision.
    input, parameter, float, number, decimal, range

    Use cases:
    - Specify a numeric value within a defined range (e.g., 0.0 to 1.0).
    - Set thresholds, confidence scores, or scaling factors.
    - Configure continuous parameters like opacity, volume, or temperature.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `float` |  | `0.0` |
| description | `str` | The description of the input for the workflow. | `` |
| min | `float` |  | `0` |
| max | `float` |  | `100` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `float` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

