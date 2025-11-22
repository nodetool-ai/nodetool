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
| unet_model | `any` | The UNet/diffusion model to use. | `{'type': 'hf.text_to_image', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| clip_model | `any` | The primary Flux CLIP checkpoint (clip-l). | `{'type': 'hf.clip', 'repo_id': 'Comfy-Org/stable-diffusion-3.5-fp8', 'path': 'text_encoders/clip_l.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| clip_model_secondary | `any` | The secondary Flux CLIP checkpoint (t5xxl). | `{'type': 'hf.clip', 'repo_id': 'Comfy-Org/stable-diffusion-3.5-fp8', 'path': 'text_encoders/t5xxl_fp8_e4m3fn_scaled.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| vae_model | `any` | The Flux VAE checkpoint. | `{'type': 'hf.vae', 'repo_id': 'ffxvs/vae-flux', 'path': 'ae.safetensors', 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `any` | The prompt to use. | `` |
| negative_prompt | `any` | The negative prompt to use. | `` |
| width | `any` |  | `1024` |
| height | `any` |  | `1024` |
| steps | `any` |  | `20` |
| guidance_scale | `any` |  | `5.0` |
| seed | `any` |  | `0` |
| denoise | `any` |  | `1.0` |
| scheduler | `any` |  | `simple` |
| sampler | `any` |  | `euler` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [comfy.text_to_image](../) namespace.

