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
| model | `any` | The Flux UNet checkpoint to use (e.g. flux1-dev or flux1-dev-kontext). | `{'type': 'hf.text_to_image', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| input_image | `any` | Reference image for Flux Kontext img2img. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `any` | The prompt to use. | `` |
| negative_prompt | `any` | The negative prompt to use (optional). | `` |
| steps | `any` |  | `20` |
| guidance_scale | `any` |  | `1.0` |
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

Browse other nodes in the [comfy.image_to_image](../) namespace.

