---
layout: page
title: "Flux"
node_type: "comfy.text_to_image.Flux"
namespace: "comfy.text_to_image"
---

**Type:** `comfy.text_to_image.Flux`

**Namespace:** `comfy.text_to_image`

## Description

Generates images from text prompts using the Flux model.
    image, text-to-image, generative AI, flux

    ComfyUI-native Flux implementation in the comfy.text_to_image namespace.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| unet_model | `hf.text_to_image` | The UNet/diffusion model to use. | `{'type': 'hf.text_to_image', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| clip_model | `hf.clip` | The primary Flux CLIP checkpoint (clip-l). | `{'type': 'hf.clip', 'repo_id': 'Comfy-Org/stable-diffusion-3.5-fp8', 'path': 'text_encoders/clip_l.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| clip_model_secondary | `hf.clip` | The secondary Flux CLIP checkpoint (t5xxl). | `{'type': 'hf.clip', 'repo_id': 'Comfy-Org/stable-diffusion-3.5-fp8', 'path': 'text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| vae_model | `hf.vae` | The Flux VAE checkpoint. | `{'type': 'hf.vae', 'repo_id': 'ffxvs/vae-flux', 'path': 'ae.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `str` | The prompt to use. | `` |
| negative_prompt | `str` | The negative prompt to use. | `` |
| width | `int` |  | `1024` |
| height | `int` |  | `1024` |
| steps | `int` |  | `20` |
| guidance_scale | `float` |  | `5.0` |
| seed | `int` |  | `0` |
| denoise | `float` |  | `1.0` |
| scheduler | `Enum['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta', 'linear_quadratic']` |  | `simple` |
| sampler | `Enum['ddim', 'ddpm', 'dpm_2', 'dpm_2_ancestral', 'dpm_adaptive', 'dpm_fast', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_2m_sde_gpu', 'dpmpp_2s_ancestral', 'dpmpp_3m_sde', 'dpmpp_3m_sde_gpu', 'dpmpp_sde', 'dpmpp_sde_gpu', 'euler', 'euler_ancestral', 'heun', 'heunpp2', 'lcm', 'lms', 'uni_pc', 'uni_pc_bh2']` |  | `euler` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [comfy.text_to_image](../) namespace.

