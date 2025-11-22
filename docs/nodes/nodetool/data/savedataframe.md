---
layout: page
title: "Save Dataframe"
node_type: "nodetool.data.SaveDataframe"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.SaveDataframe`

**Namespace:** `nodetool.data`

## Description

Save dataframe in specified folder.
    csv, folder, save

    Use cases:
    - Export processed data for external use
    - Create backups of dataframes

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| df | `any` |  | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| folder | `any` | Name of the output folder. | `{'type': 'folder', 'uri': '', 'asset_id': None, 'data': None}` |
| name | `any` | 
        Name of the output file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `output.csv` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

