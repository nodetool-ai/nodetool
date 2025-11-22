---
layout: page
title: "Save Workbook"
node_type: "lib.excel.SaveWorkbook"
namespace: "lib.excel"
---

**Type:** `lib.excel.SaveWorkbook`

**Namespace:** `lib.excel`

## Description

Saves an Excel workbook to disk.
    excel, save, export

    Use cases:
    - Export final spreadsheet
    - Save work in progress

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| workbook | `any` | The Excel workbook to save | `{'type': 'excel', 'uri': '', 'asset_id': None, 'data': None}` |
| folder | `any` | The folder to save the file to. | `{'type': 'file_path', 'path': ''}` |
| filename | `any` | 
        The filename to save the file to.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `` |

## Metadata

## Related Nodes

Browse other nodes in the [lib.excel](../) namespace.

