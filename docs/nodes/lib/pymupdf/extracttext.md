---
layout: page
title: "Extract Text"
node_type: "lib.pymupdf.ExtractText"
namespace: "lib.pymupdf"
---

**Type:** `lib.pymupdf.ExtractText`

**Namespace:** `lib.pymupdf`

## Description

Extract plain text from a PDF document using PyMuPDF.
    pdf, text, extract

    Use cases:
    - Extract raw text content from PDFs
    - Convert PDF documents to plain text
    - Prepare text for further processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| pdf | `document` | The PDF document to extract text from | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| start_page | `int` | First page to extract (0-based index) | `0` |
| end_page | `int` | Last page to extract (-1 for last page) | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pymupdf](../) namespace.

