---
layout: page
title: "PDF Extract Text (OCR)"
node_type: "lib.pdf.ExtractOcr"
namespace: "lib.pdf"
---

**Type:** `lib.pdf.ExtractOcr`

**Namespace:** `lib.pdf`

## Description

Extract text from a PDF using OCR, suitable for scanned documents and image-based PDFs.
    pdf, ocr, scan, text, extract, image-based

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| start_page | `int` | First page (0-based) | `0` |
| end_page | `int` | Last page (-1 for all) | `-1` |
| ocr_language | `str` | ISO 639-1 language code for OCR (e.g. en, fr, de, es) | `en` |
| dpi | `int` | Rendering DPI for OCR — higher values improve accuracy on small text | `150` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [lib.pdf](../) namespace.
