---
layout: page
title: "Fill NA"
node_type: "nodetool.data.FillNA"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.FillNA`

**Namespace:** `nodetool.data`

## Description

Fill missing values in dataframe.
    fillna, missing, impute

    Use cases:
    - Handle missing data
    - Prepare data for analysis
    - Improve data quality

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe | `any` | The DataFrame with missing values. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| value | `any` | Value to use for filling missing values. | `0` |
| method | `any` | Method for filling: value, forward, backward, mean, median | `value` |
| columns | `any` | Comma-separated column names to fill. Leave empty for all columns. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

