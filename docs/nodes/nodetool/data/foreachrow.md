---
layout: page
title: "For Each Row"
node_type: "nodetool.data.ForEachRow"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.ForEachRow`

**Namespace:** `nodetool.data`

## Description

Iterate over rows of a dataframe.
    iterator, loop, dataframe, sequence, rows

    Use cases:
    - Process each row of a dataframe individually
    - Trigger actions for every record in a dataset

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| dataframe | `dataframe` | The input dataframe. | `{"type":"dataframe","uri":"","asset_id":null,"d...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| row | `dict` |  |
| index | `any` |  |

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.
