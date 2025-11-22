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
| model | `hf.flux` | The FLUX model to use for text-to-image generation. | `{'type': 'hf.flux', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `str` | A text prompt describing the desired image. | `A cat holding a sign that says hello world` |
| guidance_scale | `float` | The scale for classifier-free guidance. Use 0.0 for schnell, 3.5 for dev. | `3.5` |
| width | `int` | The width of the generated image. | `1024` |
| height | `int` | The height of the generated image. | `1024` |
| num_inference_steps | `int` | The number of denoising steps. 4 steps is forced for schnell models. | `20` |
| max_sequence_length | `int` | Maximum sequence length for the prompt. Use 256 for schnell, 512 for dev. | `512` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| enable_cpu_offload | `bool` | Enable CPU offload to reduce VRAM usage. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_image](../) namespace.

