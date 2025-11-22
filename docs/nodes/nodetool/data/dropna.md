---
layout: page
title: "Drop NA"
node_type: "nodetool.data.DropNA"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.DropNA`

**Namespace:** `nodetool.data`

## Description

Remove rows with NA values from dataframe.
    na, missing, clean

    Use cases:
    - Clean dataset by removing incomplete entries
    - Prepare data for analysis requiring complete cases
    - Improve data quality for modeling

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| df | `any` | The input DataFrame. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

