---
layout: page
title: "Image To Text"
node_type: "mistral.vision.ImageToText"
namespace: "mistral.vision"
---

**Type:** `mistral.vision.ImageToText`

**Namespace:** `mistral.vision`

## Description

Analyze images and generate text descriptions using Mistral AI's Pixtral models.
    mistral, pixtral, vision, image, ocr, analysis, multimodal

    Uses Mistral AI's Pixtral vision models to understand and describe images.
    Can perform OCR, image analysis, and answer questions about images.
    Requires a Mistral API key.

    Use cases:
    - Extract text from images (OCR)
    - Describe image contents
    - Answer questions about images
    - Analyze charts and diagrams
    - Document understanding

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to analyze | `{"type":"image","uri":"","asset_id":null,"data"...` |
| prompt | `str` | The prompt/question about the image | `Describe this image in detail.` |
| model | `enum` | The Pixtral model to use for vision tasks | `pixtral-large-latest` |
| temperature | `float` | Sampling temperature for response generation | `0.3` |
| max_tokens | `int` | Maximum number of tokens to generate | `1024` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [mistral.vision](../) namespace.
