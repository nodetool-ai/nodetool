---
layout: page
title: "Flux Kontext (Img2Img)"
node_type: "comfy.image_to_image.FluxKontext"
namespace: "comfy.image_to_image"
---

**Type:** `comfy.image_to_image.FluxKontext`

**Namespace:** `comfy.image_to_image`

## Description

Transforms existing images based on text prompts using the Flux Kontext model.
    image, image-to-image, generative AI, flux, kontext

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.text_to_image` | The Flux UNet checkpoint to use (e.g. flux1-dev or flux1-dev-kontext). | `{'type': 'hf.text_to_image', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| input_image | `image` | Reference image for Flux Kontext img2img. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `str` | The prompt to use. | `` |
| negative_prompt | `str` | The negative prompt to use (optional). | `` |
| steps | `int` |  | `20` |
| guidance_scale | `float` |  | `1.0` |
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

Browse other nodes in the [comfy.image_to_image](../) namespace.

