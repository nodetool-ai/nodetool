---
layout: page
title: "PDF Extract Tables"
node_type: "lib.pdf.ExtractTables"
namespace: "lib.pdf"
---

**Type:** `lib.pdf.ExtractTables`

**Namespace:** `lib.pdf`

## Description

Detect and extract tables from a PDF by analysing text layout.
    pdf, tables, extract, data, rows, columns

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| start_page | `int` | First page (0-based) | `0` |
| end_page | `int` | Last page (-1 for all) | `-1` |
| y_tolerance | `int` | Pixel tolerance for grouping text into rows | `3` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[dict]` |  |

## Related Nodes

Browse other nodes in the [lib.pdf](../) namespace.
