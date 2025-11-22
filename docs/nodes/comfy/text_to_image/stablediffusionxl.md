---
layout: page
title: "Stable Diffusion XL"
node_type: "comfy.text_to_image.StableDiffusionXL"
namespace: "comfy.text_to_image"
---

**Type:** `comfy.text_to_image.StableDiffusionXL`

**Namespace:** `comfy.text_to_image`

## Description

Generates images from text prompts using Stable Diffusion XL.
    image, text-to-image, generative AI, SDXL

    Text-only SDXL variant; no input image.

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

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [comfy.text_to_image](../) namespace.

