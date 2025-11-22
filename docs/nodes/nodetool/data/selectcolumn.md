---
layout: page
title: "Select Column"
node_type: "nodetool.data.SelectColumn"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.SelectColumn`

**Namespace:** `nodetool.data`

## Description

Select specific columns from dataframe.
    dataframe, columns, filter

    Use cases:
    - Extract relevant features for analysis
    - Reduce dataframe size by removing unnecessary columns
    - Prepare data for specific visualizations or models

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe | `any` | a dataframe from which columns are to be selected | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| columns | `any` | comma separated list of column names | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

