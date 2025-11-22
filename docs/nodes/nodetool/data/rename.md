---
layout: page
title: "Rename"
node_type: "nodetool.data.Rename"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.Rename`

**Namespace:** `nodetool.data`

## Description

Rename columns in dataframe.
    rename, columns, names

    Use cases:
    - Standardize column names
    - Make column names more descriptive
    - Prepare data for specific requirements

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe | `any` | The DataFrame to rename columns. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| rename_map | `any` | Column rename mapping in format: old1:new1,old2:new2 | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

