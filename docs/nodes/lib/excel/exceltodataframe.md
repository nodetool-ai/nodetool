---
layout: page
title: "Excel To Data Frame"
node_type: "lib.excel.ExcelToDataFrame"
namespace: "lib.excel"
---

**Type:** `lib.excel.ExcelToDataFrame`

**Namespace:** `lib.excel`

## Description

Reads an Excel worksheet into a pandas DataFrame.
    excel, dataframe, import

    Use cases:
    - Import Excel data for analysis
    - Process spreadsheet contents

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| workbook | `any` | The Excel workbook to read from | `{'type': 'excel', 'uri': '', 'asset_id': None, 'data': None}` |
| sheet_name | `any` | Source worksheet name | `Sheet1` |
| has_header | `any` | First row contains headers | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.excel](../) namespace.

