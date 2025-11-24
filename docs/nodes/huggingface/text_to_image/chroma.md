---
layout: page
title: "Chroma"
node_type: "huggingface.text_to_image.Chroma"
namespace: "huggingface.text_to_image"
---

**Type:** `huggingface.text_to_image.Chroma`

**Namespace:** `huggingface.text_to_image`

## Description

Generates images from text prompts using Chroma, a text-to-image model based on Flux.
    image, generation, AI, text-to-image, flux, chroma, transformer

    Use cases:
    - Generate high-quality images with Flux-based architecture
    - Create images with advanced attention masking for enhanced fidelity
    - Generate images with optimized memory usage
    - Create professional-quality images with precise color control

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `str` | A text prompt describing the desired image. | `A high-fashion close-up portrait of a blonde woman in clear sunglasses. The image uses a bold teal and red color split for dramatic lighting. The background is a simple teal-green. The photo is sharp and well-composed, and is designed for viewing with anaglyph 3D glasses for optimal effect. It looks professionally done.` |
| negative_prompt | `str` | A text prompt describing what to avoid in the image. | `low quality, ugly, unfinished, out of focus, deformed, disfigure, blurry, smudged, restricted palette, flat colors` |
| guidance_scale | `float` | The scale for classifier-free guidance. | `3.0` |
| num_inference_steps | `int` | The number of denoising steps. | `40` |
| height | `int` | The height of the generated image. | `1024` |
| width | `int` | The width of the generated image. | `1024` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| max_sequence_length | `int` | Maximum sequence length to use with the prompt. | `512` |
| enable_cpu_offload | `bool` | Enable CPU offload to reduce VRAM usage. | `True` |
| enable_attention_slicing | `bool` | Enable attention slicing to reduce memory usage. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_image](../) namespace.

