---
layout: page
title: "Slice"
node_type: "nodetool.data.Slice"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.Slice`

**Namespace:** `nodetool.data`

## Description

Slice a dataframe by rows using start and end indices.
    slice, subset, rows

    Use cases:
    - Extract a specific range of rows from a large dataset
    - Create training and testing subsets for machine learning
    - Analyze data in smaller chunks

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe | `any` | The input dataframe to be sliced. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| start_index | `any` | The starting index of the slice (inclusive). | `0` |
| end_index | `any` | The ending index of the slice (exclusive). Use -1 for the last row. | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

