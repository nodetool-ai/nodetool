---
layout: page
title: "Load Image To Image Model"
node_type: "huggingface.image_to_image.LoadImageToImageModel"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.LoadImageToImageModel`

**Namespace:** `huggingface.image_to_image`

## Description

Load HuggingFace model for image-to-image generation from a repo_id.

    Use cases:
    - Loads a pipeline directly from a repo_id
    - Used for ImageToImage node

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| repo_id | `str` | The repository ID of the model to use for image-to-image generation. | `` |
| variant | `Enum['default', 'fp16', 'fp32', 'bf16']` | The variant of the model to use for image-to-image generation. | `fp16` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `hf.image_to_image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

