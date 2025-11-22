---
layout: page
title: "Qwen Image Edit"
node_type: "huggingface.image_to_image.QwenImageEdit"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.QwenImageEdit`

**Namespace:** `huggingface.image_to_image`

## Description

Performs image editing using the Qwen Image Edit model with support for GGUF quantization.
    image, editing, semantic, appearance, qwen, multimodal, quantization

    Use cases:
    - Semantic editing (object rotation, style transfer)
    - Appearance editing (adding/removing elements)
    - Precise text modifications in images
    - Background and clothing changes
    - Complex image transformations guided by text
    - Memory-efficient editing using GGUF quantization

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The Qwen-Image-Edit model to use for image editing. | `{'type': 'hf.qwen_image_edit', 'repo_id': 'QuantStack/Qwen-Image-Edit-2509-GGUF', 'path': 'Qwen-Image-Edit-2509-Q4_K_M.gguf', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `any` | The input image to edit | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `any` | Text description of the desired edit to apply to the image | `Change the object's color to blue` |
| negative_prompt | `any` | Text describing what should not appear in the edited image | `` |
| num_inference_steps | `any` | Number of denoising steps for the editing process | `50` |
| true_cfg_scale | `any` | Guidance scale for editing. Higher values follow the prompt more closely | `4.0` |
| seed | `any` | Seed for the random number generator. Use -1 for a random seed | `-1` |
| enable_memory_efficient_attention | `any` | Enable memory efficient attention to reduce VRAM usage. | `True` |
| enable_vae_tiling | `any` | Enable VAE tiling to reduce VRAM usage for large images. | `False` |
| enable_vae_slicing | `any` | Enable VAE slicing to reduce VRAM usage. | `False` |
| enable_cpu_offload | `any` | Enable CPU offload to reduce VRAM usage. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

