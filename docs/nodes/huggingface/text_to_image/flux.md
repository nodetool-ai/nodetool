---
layout: page
title: "Flux"
node_type: "huggingface.text_to_image.Flux"
namespace: "huggingface.text_to_image"
---

**Type:** `huggingface.text_to_image.Flux`

**Namespace:** `huggingface.text_to_image`

## Description

Generates images using FLUX models with support for GGUF quantization for memory efficiency.
    image, generation, AI, text-to-image, flux, quantization

    Use cases:
    - High-quality image generation with FLUX models
    - Memory-efficient generation using GGUF quantization
    - Fast generation with FLUX.1-schnell
    - High-fidelity generation with FLUX.1-dev
    - Controlled generation with Fill, Canny, or Depth variants

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The FLUX model to use for text-to-image generation. | `{'type': 'hf.flux', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `any` | A text prompt describing the desired image. | `A cat holding a sign that says hello world` |
| guidance_scale | `any` | The scale for classifier-free guidance. Use 0.0 for schnell, 3.5 for dev. | `3.5` |
| width | `any` | The width of the generated image. | `1024` |
| height | `any` | The height of the generated image. | `1024` |
| num_inference_steps | `any` | The number of denoising steps. 4 steps is forced for schnell models. | `20` |
| max_sequence_length | `any` | Maximum sequence length for the prompt. Use 256 for schnell, 512 for dev. | `512` |
| seed | `any` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| enable_vae_tiling | `any` | Enable VAE tiling to reduce VRAM usage for large images. | `False` |
| enable_vae_slicing | `any` | Enable VAE slicing to reduce VRAM usage. | `False` |
| enable_cpu_offload | `any` | Enable CPU offload to reduce VRAM usage. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_image](../) namespace.

