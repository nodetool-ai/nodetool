---
layout: page
title: "Qwen-Image"
node_type: "comfy.text_to_image.QwenImage"
namespace: "comfy.text_to_image"
---

**Type:** `comfy.text_to_image.QwenImage`

**Namespace:** `comfy.text_to_image`

## Description

Generates images from text prompts using Qwen-Image.
    image, text-to-image, generative AI, qwen

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| unet_model | `any` | The Qwen-Image UNet/diffusion checkpoint. | `{'type': 'hf.qwen_image', 'repo_id': 'Comfy-Org/Qwen-Image_ComfyUI', 'path': 'non_official/diffusion_models/qwen_image_distill_full_fp8_e4m3fn.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| clip_model | `any` | The Qwen-Image CLIP/text encoder checkpoint. | `{'type': 'hf.clip', 'repo_id': 'Comfy-Org/Qwen-Image_ComfyUI', 'path': 'split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| vae_model | `any` | The Qwen-Image VAE checkpoint. | `{'type': 'hf.vae', 'repo_id': 'Comfy-Org/Qwen-Image_ComfyUI', 'path': 'split_files/vae/qwen_image_vae.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `any` | The prompt to use. | `` |
| negative_prompt | `any` | The negative prompt to use. | `` |
| true_cfg_scale | `any` |  | `1.0` |
| steps | `any` |  | `30` |
| width | `any` |  | `1024` |
| height | `any` |  | `1024` |
| scheduler | `any` |  | `simple` |
| sampler | `any` |  | `euler` |
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

