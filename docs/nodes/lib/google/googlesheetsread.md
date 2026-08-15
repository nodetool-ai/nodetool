---
layout: page
title: "Google Sheets Read"
node_type: "lib.google.SheetsRead"
namespace: "lib.google"
---

**Type:** `lib.google.SheetsRead`

**Namespace:** `lib.google`

## Description

Read a range from a Google Sheet as rows of cell values.
    google, sheets, spreadsheet, read, rows

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| spreadsheet_id | `str` | Google Sheets spreadsheet id | `` |
| range | `str` | A1 notation range, e.g. Sheet1!A1:D50 | `A1:Z1000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list` |  |

## Related Nodes

Browse other nodes in the [lib.google](./) namespace.
