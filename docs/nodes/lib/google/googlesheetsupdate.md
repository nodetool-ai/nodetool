---
layout: page
title: "Google Sheets Update"
node_type: "lib.google.SheetsUpdate"
namespace: "lib.google"
---

**Type:** `lib.google.SheetsUpdate`

**Namespace:** `lib.google`

## Description

Overwrite a Google Sheet range with new values.
    google, sheets, spreadsheet, update, write

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| spreadsheet_id | `str` | Google Sheets spreadsheet id | `` |
| range | `str` | A1 notation range to overwrite | `A1` |
| values | `str` | Rows as JSON, e.g. [["Alice", 30], ["Bob", 41]] | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |

## Related Nodes

Browse other nodes in the [lib.google](./) namespace.
