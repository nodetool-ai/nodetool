---
layout: page
title: "Real ESRGAN"
node_type: "huggingface.image_to_image.RealESRGAN"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.RealESRGAN`

**Namespace:** `huggingface.image_to_image`

## Description

Performs image super-resolution using the RealESRGAN model.
    image, super-resolution, enhancement, huggingface

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Upscale images for better detail

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The input image to transform | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| model | `hf.real_esrgan` | The RealESRGAN model to use for image super-resolution | `{'type': 'hf.real_esrgan', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

