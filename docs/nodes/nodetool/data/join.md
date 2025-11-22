---
layout: page
title: "Join"
node_type: "nodetool.data.Join"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.Join`

**Namespace:** `nodetool.data`

## Description

Join two dataframes on specified column.
    join, merge, column

    Use cases:
    - Combine data from related tables
    - Enrich dataset with additional information
    - Link data based on common identifiers

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe_a | `any` | First DataFrame to be merged. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| dataframe_b | `any` | Second DataFrame to be merged. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| join_on | `any` | The column name on which to join the two dataframes. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

