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
| model | `any` | The image generation model to use | `{'type': 'image_model', 'provider': 'huggingface_fal_ai', 'id': 'fal-ai/flux/dev', 'name': 'FLUX.1 Dev', 'path': None, 'supported_tasks': []}` |
| image | `any` | Input image to transform | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `any` | Text prompt describing the desired transformation | `A photorealistic version of the input image` |
| negative_prompt | `any` | Text prompt describing what to avoid | `` |
| strength | `any` | How much to transform the input image (0.0 = no change, 1.0 = maximum change) | `0.8` |
| guidance_scale | `any` | Classifier-free guidance scale | `7.5` |
| num_inference_steps | `any` | Number of denoising steps | `30` |
| target_width | `any` | Target width of the output image | `512` |
| target_height | `any` | Target height of the output image | `512` |
| seed | `any` | Random seed for reproducibility (-1 for random) | `-1` |
| scheduler | `any` | Scheduler to use (provider-specific) | `` |
| safety_check | `any` | Enable safety checker | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

