---
layout: page
title: "Image to Image"
node_type: "huggingface.image_to_image.ImageToImage"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.ImageToImage`

**Namespace:** `huggingface.image_to_image`

## Description

Transforms existing images based on text prompts using AutoPipeline for Image-to-Image.
    This node automatically detects the appropriate pipeline class based on the model used.
    image, generation, image-to-image, autopipeline

    Use cases:
    - Transform existing images with any compatible model (Stable Diffusion, SDXL, Kandinsky, etc.)
    - Apply specific styles or concepts to photographs or artwork
    - Modify existing images based on text descriptions
    - Create variations of existing visual content with automatic pipeline selection

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.image_to_image` | The HuggingFace model to use for image-to-image generation. | `{'type': 'hf.image_to_image', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `str` | Text prompt describing the desired image transformation. | `A beautiful landscape with mountains and a lake at sunset` |
| negative_prompt | `str` | Text prompt describing what should not appear in the generated image. | `` |
| image | `image` | The input image to transform | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| strength | `float` | Strength of the transformation. Higher values allow for more deviation from the original image. | `0.8` |
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

