---
layout: page
title: "Sort By Column"
node_type: "nodetool.data.SortByColumn"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.SortByColumn`

**Namespace:** `nodetool.data`

## Description

Sort dataframe by specified column.
    sort, order, column

    Use cases:
    - Arrange data in ascending or descending order
    - Identify top or bottom values in dataset
    - Prepare data for rank-based analysis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| df | `dataframe` |  | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| column | `str` | The column to sort the DataFrame by. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dataframe` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

