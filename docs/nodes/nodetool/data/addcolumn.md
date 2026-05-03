---
layout: page
title: "Add Column"
node_type: "nodetool.data.AddColumn"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.AddColumn`

**Namespace:** `nodetool.data`

## Description

Add list of values as new column to dataframe.
    dataframe, column, list

    Use cases:
    - Incorporate external data into existing dataframe
    - Add calculated results as new column
    - Augment dataframe with additional features

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| dataframe | `dataframe` | Dataframe object to add a new column to. | `{"type":"dataframe","uri":"","asset_id":null,"d...` |
| column_name | `str` | The name of the new column to be added to the dataframe. | `` |
| values | `list[any]` | A list of any type of elements which will be the new column's values. | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dataframe` |  |

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.
