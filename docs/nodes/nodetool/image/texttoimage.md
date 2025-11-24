---
layout: page
title: "Text To Image"
node_type: "nodetool.image.TextToImage"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.TextToImage`

**Namespace:** `nodetool.image`

## Description

Generate images from text prompts using any supported image provider.
    Automatically routes to the appropriate backend (HuggingFace, FAL, MLX).
    image, generation, AI, text-to-image, t2i

    Use cases:
    - Create images from text descriptions
    - Switch between providers without changing workflows
    - Generate images with different AI models
    - Cost-optimize by choosing different providers

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `image_model` | The image generation model to use | `{'type': 'image_model', 'provider': 'huggingface_fal_ai', 'id': 'fal-ai/flux/schnell', 'name': 'FLUX.1 Schnell', 'path': None, 'supported_tasks': []}` |
| prompt | `str` | Text prompt describing the desired image | `A cat holding a sign that says hello world` |
| negative_prompt | `str` | Text prompt describing what to avoid in the image | `` |
| width | `int` | Width of the generated image | `512` |
| height | `int` | Height of the generated image | `512` |
| guidance_scale | `float` | Classifier-free guidance scale (higher = closer to prompt) | `7.5` |
| num_inference_steps | `int` | Number of denoising steps | `30` |
| seed | `int` | Random seed for reproducibility (-1 for random) | `-1` |
| safety_check | `bool` | Enable safety checker to filter inappropriate content | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

