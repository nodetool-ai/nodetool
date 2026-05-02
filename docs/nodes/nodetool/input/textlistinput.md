---
layout: page
title: "Text List Input"
node_type: "nodetool.input.TextListInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.TextListInput`

**Namespace:** `nodetool.input`

## Description

Accepts a list of text strings as a parameter for workflows.
    input, parameter, text, string, list

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `list[str]` | The list of text strings to use as input. | `[]` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.
