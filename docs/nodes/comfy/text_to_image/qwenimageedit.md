---
layout: page
title: "Qwen-Image-Edit"
node_type: "comfy.text_to_image.QwenImageEdit"
namespace: "comfy.text_to_image"
---

**Type:** `comfy.text_to_image.QwenImageEdit`

**Namespace:** `comfy.text_to_image`

## Description

Performs image editing using Qwen-Image-Edit with reference image conditioning.
    image, image-editing, generative AI, qwen

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| unet_model | `any` | The Qwen-Image-Edit UNet checkpoint. | `{'type': 'hf.qwen_image_edit', 'repo_id': 'Comfy-Org/Qwen-Image-Edit_ComfyUI', 'path': 'split_files/diffusion_models/qwen_image_edit_fp8_e4m3fn.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| clip_model | `any` | The Qwen-Image-Edit CLIP/text encoder checkpoint. | `{'type': 'hf.clip', 'repo_id': 'Comfy-Org/Qwen-Image_ComfyUI', 'path': 'split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| vae_model | `any` | The Qwen-Image-Edit VAE checkpoint. | `{'type': 'hf.vae', 'repo_id': 'Comfy-Org/Qwen-Image_ComfyUI', 'path': 'split_files/vae/qwen_image_vae.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| input_image | `any` | The reference image to edit. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `any` | Editing prompt. | `` |
| negative_prompt | `any` | Negative prompt. | `` |
| true_cfg_scale | `any` |  | `1.0` |
| steps | `any` |  | `20` |
| sampler | `any` |  | `euler` |
| scheduler | `any` |  | `simple` |
| seed | `any` |  | `0` |
| denoise | `any` |  | `1.0` |
| loras | `any` | List of LoRA models to apply. | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [comfy.text_to_image](../) namespace.

