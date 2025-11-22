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
| image | `any` | The image to perform OCR on | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| language | `any` | Language code for OCR | `en` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| boxes | `any` |  |
| text | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.ocr](../) namespace.

