---
layout: page
title: "Extract Page Metadata"
node_type: "lib.pdfplumber.ExtractPageMetadata"
namespace: "lib.pdfplumber"
---

**Type:** `lib.pdfplumber.ExtractPageMetadata`

**Namespace:** `lib.pdfplumber`

## Description

Extract metadata from PDF pages like dimensions, rotation, etc.
    pdf, metadata, pages

    Use cases:
    - Analyze page layouts
    - Get page dimensions
    - Check page orientations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| pdf | `any` | The PDF file to analyze | - |
| start_page | `any` | The start page to extract. 0-based indexing | `0` |
| end_page | `any` | The end page to extract. -1 for all pages | `4` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pdfplumber](../) namespace.

