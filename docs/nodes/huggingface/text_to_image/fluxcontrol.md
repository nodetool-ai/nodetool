---
layout: page
title: "Flux Control"
node_type: "huggingface.text_to_image.FluxControl"
namespace: "huggingface.text_to_image"
---

**Type:** `huggingface.text_to_image.FluxControl`

**Namespace:** `huggingface.text_to_image`

## Description

Generates images using FLUX Control models with depth or other control guidance.
    image, generation, AI, text-to-image, flux, control, depth, guidance

    Use cases:
    - Generate images with depth-based control guidance
    - Create images following structural guidance from control images
    - High-quality controlled generation with FLUX models
    - Depth-aware image generation

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.controlnet_flux` | The FLUX Control model to use for controlled image generation. | `{'type': 'hf.controlnet_flux', 'repo_id': 'black-forest-labs/FLUX.1-Depth-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `str` | A text prompt describing the desired image. | `A robot made of exotic candies and chocolates of different kinds. The background is filled with confetti and celebratory gifts.` |
| control_image | `image` | The control image to guide the generation process. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| guidance_scale | `float` | The scale for classifier-free guidance. | `10.0` |
| width | `int` | The width of the generated image. | `1024` |
| height | `int` | The height of the generated image. | `1024` |
| num_inference_steps | `int` | The number of denoising steps. | `30` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| enable_cpu_offload | `bool` | Enable CPU offload to reduce VRAM usage. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_image](../) namespace.

