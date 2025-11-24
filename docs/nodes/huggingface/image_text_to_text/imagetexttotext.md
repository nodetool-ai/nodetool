---
layout: page
title: "Image Text To Text"
node_type: "huggingface.image_text_to_text.ImageTextToText"
namespace: "huggingface.image_text_to_text"
---

**Type:** `huggingface.image_text_to_text.ImageTextToText`

**Namespace:** `huggingface.image_text_to_text`

## Description

Answers questions or follows instructions given both an image and text.
    image, text, visual question answering, multimodal, VLM

    Use cases:
    - Visual question answering with free-form reasoning
    - Zero-shot object localization or structure extraction via instructions
    - OCR-free document understanding when combined with prompts
    - Multi-turn, instruction-following conversations grounded in an image

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.image_text_to_text` | The image-text-to-text model to use. | `{'type': 'hf.image_text_to_text', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | The image to analyze. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `str` | Instruction or question for the model about the image. | `Describe this image.` |
| max_new_tokens | `int` | Maximum number of tokens to generate. | `256` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_text_to_text](../) namespace.

