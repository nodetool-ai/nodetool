---
layout: page
title: "Image To Text"
node_type: "huggingface.image_to_text.ImageToText"
namespace: "huggingface.image_to_text"
---

**Type:** `huggingface.image_to_text.ImageToText`

**Namespace:** `huggingface.image_to_text`

## Description

Generates textual descriptions from images.
    image, captioning, OCR, image-to-text

    Use cases:
    - Generate captions for images
    - Extract text from images (OCR)
    - Describe image content for visually impaired users
    - Build accessibility features for visual content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.image_to_text` | The model ID to use for image-to-text generation | `{'type': 'hf.image_to_text', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | The image to generate text from | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| max_new_tokens | `int` | The maximum number of tokens to generate (if supported by model) | `1024` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_text](../) namespace.

