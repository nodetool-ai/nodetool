---
layout: page
title: "Qwen-Image"
node_type: "huggingface.text_to_image.QwenImage"
namespace: "huggingface.text_to_image"
---

**Type:** `huggingface.text_to_image.QwenImage`

**Namespace:** `huggingface.text_to_image`

## Description

Generates images from text prompts using Qwen-Image with support for GGUF quantization.
    image, generation, AI, text-to-image, qwen, quantization

    Use cases:
    - High-quality, general-purpose text-to-image generation
    - Memory-efficient generation using GGUF quantization
    - Quick prototyping leveraging AutoPipeline
    - Works out-of-the-box with the official Qwen model

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.qwen_image` | The Qwen-Image model to use for text-to-image generation. | `{'type': 'hf.qwen_image', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `str` | A text prompt describing the desired image. | `A cat holding a sign that says hello world` |
| negative_prompt | `str` | A text prompt describing what to avoid in the image. | `` |
| true_cfg_scale | `float` | True CFG scale for Qwen-Image models. | `1.0` |
| num_inference_steps | `int` | The number of denoising steps. | `50` |
| height | `int` | The height of the generated image. | `1024` |
| width | `int` | The width of the generated image. | `1024` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| enable_memory_efficient_attention | `bool` | Enable memory efficient attention to reduce VRAM usage. | `True` |
| enable_cpu_offload | `bool` | Enable CPU offload to reduce VRAM usage. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_image](../) namespace.

