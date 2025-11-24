---
layout: page
title: "Paddle OCR"
node_type: "lib.ocr.PaddleOCR"
namespace: "lib.ocr"
---

**Type:** `lib.ocr.PaddleOCR`

**Namespace:** `lib.ocr`

## Description

Performs Optical Character Recognition (OCR) on images using PaddleOCR.
    image, text, ocr, document

    Use cases:
    - Text extraction from images
    - Document digitization
    - Receipt/invoice processing
    - Handwriting recognition

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to perform OCR on | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| language | `Enum['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ro', 'hr', 'cs', 'hu', 'sk', 'sl', 'tr', 'vi', 'id', 'ms', 'la', 'ru', 'bg', 'uk', 'be', 'mn', 'ch', 'ja', 'ko', 'ar', 'fa', 'ur', 'hi', 'mr', 'ne', 'sa']` | Language code for OCR | `en` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| boxes | `List[ocr_result]` |  |
| text | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.ocr](../) namespace.

