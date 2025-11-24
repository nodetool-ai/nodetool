---
layout: page
title: "Image To Image"
node_type: "nodetool.image.ImageToImage"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.ImageToImage`

**Namespace:** `nodetool.image`

## Description

Transform images using text prompts with any supported image provider.
    Automatically routes to the appropriate backend (HuggingFace, FAL, MLX).
    image, transformation, AI, image-to-image, i2i

    Use cases:
    - Modify existing images with text instructions
    - Style transfer and artistic modifications
    - Image enhancement and refinement
    - Creative image edits guided by prompts

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `image_model` | The image generation model to use | `{'type': 'image_model', 'provider': 'huggingface_fal_ai', 'id': 'fal-ai/flux/dev', 'name': 'FLUX.1 Dev', 'path': None, 'supported_tasks': []}` |
| image | `image` | Input image to transform | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `str` | Text prompt describing the desired transformation | `A photorealistic version of the input image` |
| negative_prompt | `str` | Text prompt describing what to avoid | `` |
| strength | `float` | How much to transform the input image (0.0 = no change, 1.0 = maximum change) | `0.8` |
| guidance_scale | `float` | Classifier-free guidance scale | `7.5` |
| num_inference_steps | `int` | Number of denoising steps | `30` |
| target_width | `int` | Target width of the output image | `512` |
| target_height | `int` | Target height of the output image | `512` |
| seed | `int` | Random seed for reproducibility (-1 for random) | `-1` |
| scheduler | `str` | Scheduler to use (provider-specific) | `` |
| safety_check | `bool` | Enable safety checker | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

