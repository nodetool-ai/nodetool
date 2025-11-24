---
layout: page
title: "String Input"
node_type: "nodetool.input.StringInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.StringInput`

**Namespace:** `nodetool.input`

## Description

Accepts a string value as a parameter for workflows.
    input, parameter, string, text, label, name, value

    Use cases:
    - Define a name for an entity or process.
    - Specify a label for a component or output.
    - Enter a short keyword or search term.
    - Provide a simple configuration value (e.g., an API key, a model name).
    - If you need to input multi-line text or the content of a file, use 'DocumentFileInput'.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `str` |  | `` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

