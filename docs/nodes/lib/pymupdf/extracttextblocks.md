---
layout: page
title: "Extract Text Blocks"
node_type: "lib.pymupdf.ExtractTextBlocks"
namespace: "lib.pymupdf"
---

**Type:** `lib.pymupdf.ExtractTextBlocks`

**Namespace:** `lib.pymupdf`

## Description

Extract text blocks with their bounding boxes from a PDF.
    pdf, text, blocks, layout

    Use cases:
    - Analyze text layout and structure
    - Extract text while preserving block-level formatting
    - Get text position information

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| pdf | `any` | The PDF document to extract text blocks from | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| start_page | `any` | First page to extract (0-based index) | `0` |
| end_page | `any` | Last page to extract (-1 for last page) | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pymupdf](../) namespace.

