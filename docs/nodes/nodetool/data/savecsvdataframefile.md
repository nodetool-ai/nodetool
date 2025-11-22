---
layout: page
title: "Save CSVDataframe File"
node_type: "nodetool.data.SaveCSVDataframeFile"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.SaveCSVDataframeFile`

**Namespace:** `nodetool.data`

## Description

Write a pandas DataFrame to a CSV file.
    files, csv, write, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe | `any` | DataFrame to write to CSV | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |
| folder | `any` | Folder where the file will be saved | `` |
| filename | `any` | Name of the CSV file to save. Supports strftime format codes. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

