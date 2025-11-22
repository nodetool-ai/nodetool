---
layout: page
title: "Extract Text With Style"
node_type: "lib.pymupdf.ExtractTextWithStyle"
namespace: "lib.pymupdf"
---

**Type:** `lib.pymupdf.ExtractTextWithStyle`

**Namespace:** `lib.pymupdf`

## Description

Extract text with style information (font, size, color) from a PDF.
    pdf, text, style, formatting

    Use cases:
    - Preserve text formatting during extraction
    - Analyze document styling
    - Extract text with font information

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| pdf | `document` | The PDF document to extract styled text from | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| start_page | `int` | First page to extract (0-based index) | `0` |
| end_page | `int` | Last page to extract (-1 for last page) | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[Dict[Any, Any]]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pymupdf](../) namespace.

