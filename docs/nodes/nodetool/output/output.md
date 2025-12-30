---
layout: page
title: "Output"
node_type: "nodetool.output.Output"
namespace: "nodetool.output"
---

**Type:** `nodetool.output.Output`

**Namespace:** `nodetool.output`

## Description

Generic output node that handles all data types. This unified output node automatically adapts to the type of data connected to it, making it simple to return results from any workflow.

output, result, return, workflow, any, generic

Use cases:
- Returning any type of result from a workflow (text, images, audio, video, etc.)
- Simplifying workflows by using a single output node type
- Passing data between workflow nodes
- Displaying final results in the workflow output panel

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `any` | The value to output (accepts any data type). | `None` |
| description | `str` | The description of the output for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` | The output value |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.output](../) namespace.
