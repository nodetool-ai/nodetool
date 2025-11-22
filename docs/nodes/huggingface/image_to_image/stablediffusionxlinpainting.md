---
layout: page
title: "Stable Diffusion XL (Inpaint)"
node_type: "huggingface.image_to_image.StableDiffusionXLInpainting"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.StableDiffusionXLInpainting`

**Namespace:** `huggingface.image_to_image`

## Description

Performs inpainting on images using Stable Diffusion XL.
    image, inpainting, SDXL

    Use cases:
    - Remove unwanted objects from images
    - Fill in missing parts of images
    - Modify specific areas of images while preserving the rest

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The Stable Diffusion XL model to use for generation. | `{'type': 'hf.stable_diffusion_xl', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| variant | `any` | The variant of the model to use for generation. | `fp16` |
| prompt | `any` | The prompt for image generation. | `` |
| negative_prompt | `any` | The negative prompt to guide what should not appear in the generated image. | `` |
| width | `any` | Width of the generated image. | `1024` |
| height | `any` | Height of the generated image | `1024` |
| seed | `any` | Seed for the random number generator. | `-1` |
| num_inference_steps | `any` | Number of inference steps. | `25` |
| guidance_scale | `any` | Guidance scale for generation. | `7.0` |
| scheduler | `any` | The scheduler to use for the diffusion process. | `EulerDiscreteScheduler` |
| pag_scale | `any` | Scale of the Perturbed-Attention Guidance applied to the image. | `3.0` |
| loras | `any` | The LoRA models to use for image processing | `[]` |
| lora_scale | `any` | Strength of the LoRAs | `0.5` |
| ip_adapter_model | `any` | The IP adapter model to use for image processing | `{'type': 'hf.ip_adapter', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| ip_adapter_image | `any` | When provided the image will be fed into the IP adapter | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| ip_adapter_scale | `any` | Strength of the IP adapter image | `0.5` |
| enable_attention_slicing | `any` | Enable attention slicing for the pipeline. This can reduce VRAM usage. | `True` |
| enable_tiling | `any` | Enable tiling for the VAE. This can reduce VRAM usage. | `False` |
| enable_cpu_offload | `any` | Enable CPU offload for the pipeline. This can reduce VRAM usage. | `False` |
| output_type | `any` | The type of output to generate. | `Image` |
| image | `any` | The initial image to be inpainted. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| mask_image | `any` | The mask image indicating areas to be inpainted. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| strength | `any` | Strength for inpainting. Higher values allow for more deviation from the original image. | `0.8` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image | `any` |  |
| latent | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

