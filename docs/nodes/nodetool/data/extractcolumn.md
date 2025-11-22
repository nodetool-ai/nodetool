---
layout: page
title: "Extract Column"
node_type: "nodetool.data.ExtractColumn"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.ExtractColumn`

**Namespace:** `nodetool.data`

## Description

Convert dataframe column to list.
    dataframe, column, list

    Use cases:
    - Extract data for use in other processing steps
    - Prepare column data for plotting or analysis
    - Convert categorical data to list for encoding

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe | `any` | The input dataframe. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| column_name | `any` | The name of the column to be converted to a list. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

