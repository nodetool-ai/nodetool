---
layout: page
title: "Merge"
node_type: "nodetool.data.Merge"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.Merge`

**Namespace:** `nodetool.data`

## Description

Merge two dataframes along columns.
    merge, concat, columns

    Use cases:
    - Combine data from multiple sources
    - Add new features to existing dataframe
    - Merge time series data from different periods

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe_a | `dataframe` | First DataFrame to be merged. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| dataframe_b | `dataframe` | Second DataFrame to be merged. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dataframe` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

