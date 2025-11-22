---
layout: page
title: "Stable Diffusion Latent Upscaler"
node_type: "huggingface.image_to_image.StableDiffusionLatentUpscaler"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.StableDiffusionLatentUpscaler`

**Namespace:** `huggingface.image_to_image`

## Description

Upscales Stable Diffusion latents (x2) using the SD Latent Upscaler pipeline.
    tensor, upscaling, stable-diffusion, latent, SD

    Input and output are tensors for chaining with latent-based workflows.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `any` | The prompt for upscaling guidance. | `` |
| negative_prompt | `any` | The negative prompt to guide what should not appear in the result. | `` |
| num_inference_steps | `any` | Number of upscaling denoising steps. | `10` |
| guidance_scale | `any` | Guidance scale for upscaling. 0 preserves content strongly. | `0.0` |
| seed | `any` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| latents | `any` | Low-resolution latents tensor to upscale. | `{'type': 'torch_tensor', 'value': None, 'dtype': '<i8', 'shape': [1]}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

