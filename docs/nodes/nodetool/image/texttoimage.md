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
| model | `any` | The image generation model to use | `{'type': 'image_model', 'provider': 'huggingface_fal_ai', 'id': 'fal-ai/flux/schnell', 'name': 'FLUX.1 Schnell', 'path': None, 'supported_tasks': []}` |
| prompt | `any` | Text prompt describing the desired image | `A cat holding a sign that says hello world` |
| negative_prompt | `any` | Text prompt describing what to avoid in the image | `` |
| width | `any` | Width of the generated image | `512` |
| height | `any` | Height of the generated image | `512` |
| guidance_scale | `any` | Classifier-free guidance scale (higher = closer to prompt) | `7.5` |
| num_inference_steps | `any` | Number of denoising steps | `30` |
| seed | `any` | Random seed for reproducibility (-1 for random) | `-1` |
| safety_check | `any` | Enable safety checker to filter inappropriate content | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

