---
layout: page
title: "Stable Diffusion XLImage To Image"
node_type: "comfy.image_to_image.StableDiffusionXLImageToImage"
namespace: "comfy.image_to_image"
---

**Type:** `comfy.image_to_image.StableDiffusionXLImageToImage`

**Namespace:** `comfy.image_to_image`

## Description

Transforms existing images based on text prompts using Stable Diffusion XL.
    image, image-to-image, generative AI, SDXL

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model to use. | `{'type': 'hf.text_to_image', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `any` | The prompt to use. | `` |
| negative_prompt | `any` | The negative prompt to use. | `` |
| seed | `any` |  | `0` |
| guidance_scale | `any` |  | `7.0` |
| num_inference_steps | `any` |  | `30` |
| width | `any` |  | `768` |
| height | `any` |  | `768` |
| scheduler | `any` |  | `exponential` |
| sampler | `any` |  | `euler_ancestral` |
| loras | `any` | List of LoRA models to apply | `[]` |
| input_image | `any` | Input image for img2img | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| mask_image | `any` | Mask image for img2img (optional) | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| grow_mask_by | `any` |  | `6` |
| denoise | `any` |  | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [comfy.image_to_image](../) namespace.

