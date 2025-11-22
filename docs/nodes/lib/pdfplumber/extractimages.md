---
layout: page
title: "Extract Images"
node_type: "lib.pdfplumber.ExtractImages"
namespace: "lib.pdfplumber"
---

**Type:** `lib.pdfplumber.ExtractImages`

**Namespace:** `lib.pdfplumber`

## Description

Extract images from a PDF file.
    pdf, image, extract

    Use cases:
    - Extract embedded images from PDF documents
    - Save PDF images as separate files
    - Process PDF images for analysis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| pdf | `document` | The PDF file to extract images from | - |
| start_page | `int` | The start page to extract | `0` |
| end_page | `int` | The end page to extract | `4` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[image]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pdfplumber](../) namespace.

