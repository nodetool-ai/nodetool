---
layout: page
title: "Data Frame To Excel"
node_type: "lib.excel.DataFrameToExcel"
namespace: "lib.excel"
---

**Type:** `lib.excel.DataFrameToExcel`

**Namespace:** `lib.excel`

## Description

Writes a DataFrame to an Excel worksheet.
    excel, dataframe, export

    Use cases:
    - Export data analysis results
    - Create reports from data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| workbook | `excel` | The Excel workbook to write to | `{"type":"excel","uri":"","asset_id":null,"data"...` |
| dataframe | `dataframe` | DataFrame to write | `{"type":"dataframe","uri":"","asset_id":null,"d...` |
| sheet_name | `str` | Target worksheet name | `Sheet1` |
| start_cell | `str` | Starting cell for data | `A1` |
| include_header | `bool` | Include column headers | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Related Nodes

Browse other nodes in the [lib.excel](../) namespace.
