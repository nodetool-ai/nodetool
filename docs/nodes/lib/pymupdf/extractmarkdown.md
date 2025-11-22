---
layout: page
title: "Extract Markdown"
node_type: "lib.pymupdf.ExtractMarkdown"
namespace: "lib.pymupdf"
---

**Type:** `lib.pymupdf.ExtractMarkdown`

**Namespace:** `lib.pymupdf`

## Description

Convert PDF to Markdown format using pymupdf4llm.
    pdf, markdown, convert

    Use cases:
    - Convert PDF documents to markdown format
    - Preserve document structure in markdown
    - Create editable markdown from PDFs

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| pdf | `any` | The PDF document to convert to markdown | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| start_page | `any` | First page to extract (0-based index) | `0` |
| end_page | `any` | Last page to extract (-1 for last page) | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pymupdf](../) namespace.

