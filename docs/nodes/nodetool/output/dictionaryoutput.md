---
layout: page
title: "Dictionary Output"
node_type: "nodetool.output.DictionaryOutput"
namespace: "nodetool.output"
---

**Type:** `nodetool.output.DictionaryOutput`

**Namespace:** `nodetool.output`

## Description

Output node for key-value pair data (dictionary).
    dictionary, key-value, mapping, object, json_object, struct

    Use cases:
    - Returning multiple named values as a single structured output.
    - Passing complex data structures or configurations between nodes.
    - Organizing heterogeneous output data into a named map.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `Dict[str, any]` |  | `{}` |
| description | `str` | The description of the output for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.output](../) namespace.

