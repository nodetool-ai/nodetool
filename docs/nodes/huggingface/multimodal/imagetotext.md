---
layout: page
title: "Image To Text"
node_type: "huggingface.multimodal.ImageToText"
namespace: "huggingface.multimodal"
---

**Type:** `huggingface.multimodal.ImageToText`

**Namespace:** `huggingface.multimodal`

## Description

Generates text descriptions from images.
    image, text, captioning, vision-language

    Use cases:
    - Automatic image captioning
    - Assisting visually impaired users
    - Enhancing image search capabilities
    - Generating alt text for web images

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for image-to-text generation | `{'type': 'hf.image_to_text', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `any` | The image to generate text from | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| max_new_tokens | `any` | The maximum number of tokens to generate | `50` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.multimodal](../) namespace.

