---
layout: page
title: "Select"
node_type: "nodetool.constant.Select"
namespace: "nodetool.constant"
---

**Type:** `nodetool.constant.Select`

**Namespace:** `nodetool.constant`

## Description

Represents a selection from a predefined set of options in the workflow.
    select, enum, dropdown, choice, options

    Use cases:
    - Choose from a fixed set of values
    - Configure options for downstream nodes
    - Provide enum-compatible inputs for nodes that expect specific values

    The output is a string that can be connected to enum-typed inputs.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `str` | The currently selected value. | `` |
| options | `list[str]` | The list of available options to choose from. | `[]` |
| enum_type_name | `str` | The enum type name this select corresponds to (for type matching). | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.constant](../) namespace.
