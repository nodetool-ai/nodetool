---
layout: page
title: "Image To Text"
node_type: "xai.vision.ImageToText"
namespace: "xai.vision"
---

**Type:** `xai.vision.ImageToText`

**Namespace:** `xai.vision`

## Description

Analyze images and generate text using xAI's Grok vision models.
    xai, grok, vision, image, ocr, analysis, multimodal

    Uses Grok's multimodal models to understand and describe images via the
    OpenAI-compatible chat completions endpoint. Can perform OCR, image
    analysis, and answer questions about images. Requires an xAI API key.

    Use cases:
    - Describe image contents
    - Answer questions about images
    - Extract text from images (OCR)
    - Analyze charts and diagrams

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to analyze | `{"type":"image","uri":"","asset_id":null,"data"...` |
| prompt | `str` | The prompt/question about the image | `Describe this image in detail.` |
| model | `str` | The Grok vision model to use (e.g. grok-2-vision-1212, grok-4). | `grok-2-vision-1212` |
| temperature | `float` | Sampling temperature for response generation | `0.3` |
| max_tokens | `int` | Maximum number of tokens to generate | `1024` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [xai.vision](./) namespace.
