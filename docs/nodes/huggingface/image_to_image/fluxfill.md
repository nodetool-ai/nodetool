---
layout: page
title: "Flux Fill"
node_type: "huggingface.image_to_image.FluxFill"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.FluxFill`

**Namespace:** `huggingface.image_to_image`

## Description

Performs image inpainting/filling using FLUX Fill models with support for GGUF quantization.
    image, inpainting, fill, flux, quantization, mask

    Use cases:
    - Fill masked regions in images with high-quality content
    - Remove unwanted objects from images
    - Complete missing parts of images
    - Memory-efficient inpainting using GGUF quantization
    - High-quality image editing with FLUX models

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.inpainting` | The FLUX Fill model to use for image inpainting. | `{'type': 'hf.inpainting', 'repo_id': 'black-forest-labs/FLUX.1-Fill-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `str` | A text prompt describing what should fill the masked area. | `a white paper cup` |
| image | `image` | The input image to fill/inpaint | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| mask_image | `image` | The mask image indicating areas to be filled (white areas will be filled) | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| height | `int` | The height of the generated image. | `1024` |
| width | `int` | The width of the generated image. | `1024` |
| guidance_scale | `float` | Guidance scale for generation. Higher values follow the prompt more closely | `30.0` |
| num_inference_steps | `int` | Number of denoising steps | `50` |
| max_sequence_length | `int` | Maximum sequence length for the prompt. | `512` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| enable_cpu_offload | `bool` | Enable CPU offload to reduce VRAM usage. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

