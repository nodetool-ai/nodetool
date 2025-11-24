---
layout: page
title: "Save CSVFile"
node_type: "nodetool.dictionary.SaveCSVFile"
namespace: "nodetool.dictionary"
---

**Type:** `nodetool.dictionary.SaveCSVFile`

**Namespace:** `nodetool.dictionary`

## Description

Write a list of dictionaries to a CSV file.
    files, csv, write, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| data | `List[Dict[Any, Any]]` | list of dictionaries to write to CSV | `[]` |
| folder | `str` | Folder where the file will be saved | `` |
| filename | `str` | Name of the CSV file to save. Supports strftime format codes. | `` |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.dictionary](../) namespace.

