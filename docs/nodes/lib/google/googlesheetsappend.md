---
layout: page
title: "Google Sheets Append"
node_type: "lib.google.SheetsAppend"
namespace: "lib.google"
---

**Type:** `lib.google.SheetsAppend`

**Namespace:** `lib.google`

## Description

Append rows below the last populated row of a Google Sheet range.
    google, sheets, spreadsheet, append, rows

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| spreadsheet_id | `str` | Google Sheets spreadsheet id | `` |
| range | `str` | A1 notation range identifying the table | `A:Z` |
| values | `str` | Rows as JSON, e.g. [["Alice", 30], ["Bob", 41]] | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |

## Related Nodes

Browse other nodes in the [lib.google](./) namespace.
