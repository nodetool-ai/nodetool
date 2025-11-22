---
layout: page
title: "Extract Text"
node_type: "lib.pdfplumber.ExtractText"
namespace: "lib.pdfplumber"
---

**Type:** `lib.pdfplumber.ExtractText`

**Namespace:** `lib.pdfplumber`

## Description

Extract text content from a PDF file.
    pdf, text, extract

    Use cases:
    - Convert PDF documents to plain text
    - Extract content for analysis
    - Enable text search in PDF documents

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| pdf | `any` | The PDF file to extract text from | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| start_page | `any` | The start page to extract. 0-based indexing | `0` |
| end_page | `any` | The end page to extract. -1 for all pages | `4` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pdfplumber](../) namespace.

