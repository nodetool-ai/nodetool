---
layout: page
title: "Pivot"
node_type: "nodetool.data.Pivot"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.Pivot`

**Namespace:** `nodetool.data`

## Description

Pivot dataframe to reshape data.
    pivot, reshape, transform

    Use cases:
    - Transform long data to wide format
    - Create cross-tabulation tables
    - Reorganize data for visualization

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe | `dataframe` | The DataFrame to pivot. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| index | `str` | Column name to use as index (rows). | `` |
| columns | `str` | Column name to use as columns. | `` |
| values | `str` | Column name to use as values. | `` |
| aggfunc | `str` | Aggregation function: sum, mean, count, min, max, first, last | `sum` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dataframe` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

