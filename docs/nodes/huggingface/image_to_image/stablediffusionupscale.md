---
layout: page
title: "Stable Diffusion 4x Upscale"
node_type: "huggingface.image_to_image.StableDiffusionUpscale"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.StableDiffusionUpscale`

**Namespace:** `huggingface.image_to_image`

## Description

Upscales an image using Stable Diffusion 4x upscaler.
    image, upscaling, stable-diffusion, SD

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Create high-resolution versions of small images

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `any` | The prompt for image generation. | `` |
| negative_prompt | `any` | The negative prompt to guide what should not appear in the generated image. | `` |
| num_inference_steps | `any` | Number of upscaling steps. | `25` |
| guidance_scale | `any` | Guidance scale for generation. | `7.5` |
| image | `any` | The initial image for Image-to-Image generation. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| scheduler | `any` | The scheduler to use for the diffusion process. | `HeunDiscreteScheduler` |
| seed | `any` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| enable_tiling | `any` | Enable tiling to save VRAM | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

