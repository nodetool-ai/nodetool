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
| unet_model | `hf.qwen_image_edit` | The Qwen-Image-Edit UNet checkpoint. | `{'type': 'hf.qwen_image_edit', 'repo_id': 'Comfy-Org/Qwen-Image-Edit_ComfyUI', 'path': 'split_files/diffusion_models/qwen_image_edit_fp8_e4m3fn.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| clip_model | `hf.clip` | The Qwen-Image-Edit CLIP/text encoder checkpoint. | `{'type': 'hf.clip', 'repo_id': 'Comfy-Org/Qwen-Image_ComfyUI', 'path': 'split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| vae_model | `hf.vae` | The Qwen-Image-Edit VAE checkpoint. | `{'type': 'hf.vae', 'repo_id': 'Comfy-Org/Qwen-Image_ComfyUI', 'path': 'split_files/vae/qwen_image_vae.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| input_image | `image` | The reference image to edit. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `str` | Editing prompt. | `` |
| negative_prompt | `str` | Negative prompt. | `` |
| true_cfg_scale | `float` |  | `1.0` |
| steps | `int` |  | `20` |
| sampler | `Enum['ddim', 'ddpm', 'dpm_2', 'dpm_2_ancestral', 'dpm_adaptive', 'dpm_fast', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_2m_sde_gpu', 'dpmpp_2s_ancestral', 'dpmpp_3m_sde', 'dpmpp_3m_sde_gpu', 'dpmpp_sde', 'dpmpp_sde_gpu', 'euler', 'euler_ancestral', 'heun', 'heunpp2', 'lcm', 'lms', 'uni_pc', 'uni_pc_bh2']` |  | `euler` |
| scheduler | `Enum['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta', 'linear_quadratic']` |  | `simple` |
| seed | `int` |  | `0` |
| denoise | `float` |  | `1.0` |
| loras | `List[comfy.lora_config]` | List of LoRA models to apply. | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [comfy.text_to_image](../) namespace.

