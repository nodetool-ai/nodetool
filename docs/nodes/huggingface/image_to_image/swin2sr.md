---
layout: page
title: "Swin2SR"
node_type: "huggingface.image_to_image.Swin2SR"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.Swin2SR`

**Namespace:** `huggingface.image_to_image`

## Description

Performs image super-resolution using the Swin2SR model.
    image, super-resolution, enhancement, huggingface

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Upscale images for better detail

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `any` | The input image to transform | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `any` | The text prompt to guide the image transformation (if applicable) | `` |
| model | `any` | The model ID to use for image super-resolution | `{'type': 'hf.image_to_image', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

