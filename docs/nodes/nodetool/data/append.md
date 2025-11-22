---
layout: page
title: "Append"
node_type: "nodetool.data.Append"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.Append`

**Namespace:** `nodetool.data`

## Description

Append two dataframes along rows.
    append, concat, rows

    Use cases:
    - Combine data from multiple time periods
    - Merge datasets with same structure
    - Aggregate data from different sources

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe_a | `dataframe` | First DataFrame to be appended. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| dataframe_b | `dataframe` | Second DataFrame to be appended. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dataframe` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

