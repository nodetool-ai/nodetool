---
layout: page
title: "Boolean Input"
node_type: "nodetool.input.BooleanInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.BooleanInput`

**Namespace:** `nodetool.input`

## Description

Accepts a boolean (true/false) value as a parameter for workflows.  This input is used for binary choices, enabling or disabling features, or controlling conditional logic paths.
    input, parameter, boolean, bool, toggle, switch, flag

    Use cases:
    - Toggle features or settings on or off.
    - Set binary flags to control workflow behavior.
    - Make conditional choices within a workflow (e.g., proceed if true).

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `bool` |  | `False` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

