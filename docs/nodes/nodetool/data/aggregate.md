---
layout: page
title: "Aggregate"
node_type: "nodetool.data.Aggregate"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.Aggregate`

**Namespace:** `nodetool.data`

## Description

Aggregate dataframe by one or more columns.
    aggregate, groupby, group, sum, mean, count, min, max, std, var, median, first, last

    Use cases:
    - Prepare data for aggregation operations
    - Analyze data by categories
    - Create summary statistics by groups

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe | `any` | The DataFrame to group. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| columns | `any` | Comma-separated column names to group by. | `` |
| aggregation | `any` | Aggregation function: sum, mean, count, min, max, std, var, median, first, last | `sum` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

