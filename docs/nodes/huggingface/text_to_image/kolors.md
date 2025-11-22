---
layout: page
title: "Kolors Text2Image"
node_type: "huggingface.text_to_image.Kolors"
namespace: "huggingface.text_to_image"
---

**Type:** `huggingface.text_to_image.Kolors`

**Namespace:** `huggingface.text_to_image`

## Description

Generates images from text prompts using Kolors, a large-scale text-to-image generation model.
    image, generation, AI, text-to-image, kolors, chinese, english

    Use cases:
    - Generate high-quality photorealistic images from text descriptions
    - Create images with Chinese text understanding and rendering
    - Produce images with complex semantic accuracy
    - Generate images with both Chinese and English text support
    - Create detailed images with strong text rendering capabilities

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `str` | A text prompt describing the desired image. Supports both Chinese and English. | `A ladybug photo, macro, zoom, high quality, film, holding a sign that says "可图"` |
| negative_prompt | `str` | A text prompt describing what to avoid in the image. | `` |
| guidance_scale | `float` | The scale for classifier-free guidance. | `6.5` |
| num_inference_steps | `int` | The number of denoising steps. | `25` |
| width | `int` | The width of the generated image. | `1024` |
| height | `int` | The height of the generated image. | `1024` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| max_sequence_length | `int` | Maximum sequence length for the prompt. | `256` |
| use_dpm_solver | `bool` | Whether to use DPMSolverMultistepScheduler with Karras sigmas for better quality. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_to_image](../) namespace.

