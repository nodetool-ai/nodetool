---
layout: page
title: "AutoPipeline Inpainting"
node_type: "huggingface.image_to_image.Inpaint"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.Inpaint`

**Namespace:** `huggingface.image_to_image`

## Description

Performs inpainting on images using AutoPipeline for Inpainting.
    This node automatically detects the appropriate pipeline class based on the model used.
    image, inpainting, autopipeline, stable-diffusion, SDXL, kandinsky

    Use cases:
    - Remove unwanted objects from images with any compatible model
    - Fill in missing parts of images using various diffusion models
    - Modify specific areas of images while preserving the rest
    - Automatic pipeline selection for different model architectures

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.image_to_image` | The HuggingFace model to use for inpainting. | `{'type': 'hf.image_to_image', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `str` | Text prompt describing what should be generated in the masked area. | `` |
| negative_prompt | `str` | Text prompt describing what should not appear in the generated content. | `` |
| image | `image` | The input image to inpaint | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| mask_image | `image` | The mask image indicating areas to be inpainted (white areas will be inpainted) | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| num_inference_steps | `int` | Number of denoising steps. | `25` |
| guidance_scale | `float` | Guidance scale for generation. Higher values follow the prompt more closely. | `7.5` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

