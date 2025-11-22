---
layout: page
title: "Stable Diffusion"
node_type: "comfy.text_to_image.StableDiffusion"
namespace: "comfy.text_to_image"
---

**Type:** `comfy.text_to_image.StableDiffusion`

**Namespace:** `comfy.text_to_image`

## Description

Generates images from text prompts using Stable Diffusion.
    image, text-to-image, generative AI, stable diffusion, SD1.5

    This node is strictly text-to-image: it never consumes an input image.

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

