---
layout: page
title: "Control Net"
node_type: "comfy.image_to_image.ControlNet"
namespace: "comfy.image_to_image"
---

**Type:** `comfy.image_to_image.ControlNet`

**Namespace:** `comfy.image_to_image`

## Description

Generates images using Stable Diffusion with ControlNet for additional image control.
    image, controlnet, generative, stable diffusion, high-resolution, SD

    This node makes it explicit that it consumes an input image and a separate
    control image.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.text_to_image` | The model to use. | `{'type': 'hf.text_to_image', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `str` | The prompt to use. | `` |
| negative_prompt | `str` | The negative prompt to use. | `` |
| seed | `int` |  | `0` |
| guidance_scale | `float` |  | `7.0` |
| num_inference_steps | `int` |  | `30` |
| width | `int` |  | `768` |
| height | `int` |  | `768` |
| scheduler | `Enum['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta', 'linear_quadratic']` |  | `exponential` |
| sampler | `Enum['ddim', 'ddpm', 'dpm_2', 'dpm_2_ancestral', 'dpm_adaptive', 'dpm_fast', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_2m_sde_gpu', 'dpmpp_2s_ancestral', 'dpmpp_3m_sde', 'dpmpp_3m_sde_gpu', 'dpmpp_sde', 'dpmpp_sde_gpu', 'euler', 'euler_ancestral', 'heun', 'heunpp2', 'lcm', 'lms', 'uni_pc', 'uni_pc_bh2']` |  | `euler_ancestral` |
| loras | `List[comfy.lora_config]` | List of LoRA models to apply | `[]` |
| input_image | `image` | Input image for img2img | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| mask_image | `image` | Mask image for img2img (optional) | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| grow_mask_by | `int` |  | `6` |
| denoise | `float` |  | `1.0` |
| controlnet | `hf.controlnet` | The ControlNet model to use. | `{'type': 'hf.controlnet', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | Canny edge detection image for ControlNet | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| strength | `float` | Strength of ControlNet (used for both low and high resolution) | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [comfy.image_to_image](../) namespace.

