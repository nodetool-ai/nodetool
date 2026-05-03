---
layout: page
title: "Select Input"
node_type: "nodetool.input.SelectInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.SelectInput`

**Namespace:** `nodetool.input`

## Description

Accepts a selection from a predefined set of options as a parameter for workflows.
    input, parameter, select, enum, dropdown, choice, options

    Use cases:
    - Let users choose from a fixed set of values in app mode
    - Configure enum-like options for downstream nodes
    - Provide dropdown selection for workflow parameters

    The output is a string that can be connected to enum-typed inputs.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `str` | The currently selected value. | `` |
| description | `str` | The description of the input for the workflow. | `` |
| options | `list[str]` | The list of available options to choose from. | `[]` |
| enum_type_name | `str` | The enum type name this select corresponds to (for type matching). | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.
