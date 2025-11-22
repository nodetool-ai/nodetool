---
layout: page
title: "Load CSV Assets"
node_type: "nodetool.data.LoadCSVAssets"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.LoadCSVAssets`

**Namespace:** `nodetool.data`

## Description

Load dataframes from an asset folder.
    load, dataframe, file, import

    Use cases:
    - Load multiple dataframes from a folder
    - Process multiple datasets in sequence
    - Batch import of data files

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| folder | `folder` | The asset folder to load the dataframes from. | `{'type': 'folder', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| dataframe | `dataframe` |  |
| name | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

