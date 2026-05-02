---
layout: page
title: "Dataframe Input"
node_type: "nodetool.input.DataframeInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.DataframeInput`

**Namespace:** `nodetool.input`

## Description

Accepts a reference to a dataframe asset for workflows.
    input, parameter, dataframe, table, data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `dataframe` | The dataframe to use as input. | `{"type":"dataframe","uri":"","asset_id":null,"d...` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dataframe` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.
