---
layout: page
title: "Extract Tables"
node_type: "lib.pymupdf.ExtractTables"
namespace: "lib.pymupdf"
---

**Type:** `lib.pymupdf.ExtractTables`

**Namespace:** `lib.pymupdf`

## Description

Extract tables from a PDF document using PyMuPDF.
    pdf, tables, extract, structured

    Use cases:
    - Extract tabular data from PDFs
    - Convert PDF tables to structured formats
    - Analyze table layouts and content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| pdf | `document` | The PDF document to extract tables from | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| start_page | `int` | First page to extract (0-based index) | `0` |
| end_page | `int` | Last page to extract (-1 for last page) | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[Dict[Any, Any]]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pymupdf](../) namespace.

