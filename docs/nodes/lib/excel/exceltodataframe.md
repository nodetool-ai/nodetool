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
|----------|------|-------------|---------|
| workbook | `excel` | The Excel workbook to read from | `{"type":"excel","uri":"","asset_id":null,"data"...` |
| sheet_name | `str` | Source worksheet name | `Sheet1` |
| has_header | `bool` | First row contains headers | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dataframe` |  |

## Related Nodes

Browse other nodes in the [lib.excel](../) namespace.
