---
layout: page
title: "Format Cells"
node_type: "lib.excel.FormatCells"
namespace: "lib.excel"
---

**Type:** `lib.excel.FormatCells`

**Namespace:** `lib.excel`

## Description

Applies formatting to a range of cells.
    excel, format, style

    Use cases:
    - Highlight important data
    - Create professional looking reports

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| workbook | `any` | The Excel workbook to format | `{'type': 'excel', 'uri': '', 'asset_id': None, 'data': None}` |
| sheet_name | `any` | Target worksheet name | `Sheet1` |
| cell_range | `any` | Cell range to format (e.g. 'A1:B10') | `A1:B10` |
| bold | `any` | Make text bold | `False` |
| background_color | `any` | Background color in hex format (e.g. 'FFFF00' for yellow) | `FFFF00` |
| text_color | `any` | Text color in hex format | `000000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.excel](../) namespace.

