---
layout: page
title: "OCR"
node_type: "mistral.vision.OCR"
namespace: "mistral.vision"
---

**Type:** `mistral.vision.OCR`

**Namespace:** `mistral.vision`

## Description

Extract text from images using Mistral AI's Pixtral models.
    mistral, pixtral, ocr, text extraction, document, image

    Specialized node for optical character recognition (OCR) using Pixtral.
    Optimized for extracting text content from documents, screenshots, and images.
    Requires a Mistral API key.

    Use cases:
    - Extract text from scanned documents
    - Read text from screenshots
    - Digitize printed materials
    - Extract data from forms and receipts

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to extract text from | `{"type":"image","uri":"","asset_id":null,"data"...` |
| model | `enum` | The Pixtral model to use for OCR | `pixtral-large-latest` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [mistral.vision](../) namespace.
