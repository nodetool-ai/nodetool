---
layout: page
title: "Stable Diffusion ControlNet Inpaint"
node_type: "huggingface.image_to_image.StableDiffusionControlNetInpaint"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.StableDiffusionControlNetInpaint`

**Namespace:** `huggingface.image_to_image`

## Description

Performs inpainting on images using Stable Diffusion with ControlNet guidance.
    image, inpainting, controlnet, SD, style-transfer

    Use cases:
    - Remove unwanted objects from images with precise control
    - Fill in missing parts of images guided by control images
    - Modify specific areas of images while preserving the rest and maintaining structure

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model to use for image generation. | `{'type': 'hf.stable_diffusion', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| variant | `any` | The variant of the model to use for generation. | `fp16` |
| prompt | `any` | The prompt for image generation. | `` |
| negative_prompt | `any` | The negative prompt to guide what should not appear in the generated image. | `` |
| seed | `any` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| num_inference_steps | `any` | Number of denoising steps. | `25` |
| guidance_scale | `any` | Guidance scale for generation. | `7.5` |
| scheduler | `any` | The scheduler to use for the diffusion process. | `EulerDiscreteScheduler` |
| loras | `any` | The LoRA models to use for image processing | `[]` |
| ip_adapter_model | `any` | The IP adapter model to use for image processing | `{'type': 'hf.ip_adapter', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| ip_adapter_image | `any` | When provided the image will be fed into the IP adapter | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| ip_adapter_scale | `any` | The strength of the IP adapter | `0.5` |
| pag_scale | `any` | Scale of the Perturbed-Attention Guidance applied to the image. | `3.0` |
| latents | `any` | Optional initial latents to start generation from. | `{'type': 'torch_tensor', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| enable_attention_slicing | `any` | Enable attention slicing for the pipeline. This can reduce VRAM usage. | `True` |
| enable_tiling | `any` | Enable tiling for the VAE. This can reduce VRAM usage. | `True` |
| enable_cpu_offload | `any` | Enable CPU offload for the pipeline. This can reduce VRAM usage. | `True` |
| output_type | `any` | The type of output to generate. | `Image` |
| controlnet | `any` | The ControlNet model to use for guidance. | `lllyasviel/control_v11p_sd15_inpaint` |
| init_image | `any` | The initial image to be inpainted. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| mask_image | `any` | The mask image indicating areas to be inpainted. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| control_image | `any` | The control image to guide the inpainting process. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| controlnet_conditioning_scale | `any` | The scale for ControlNet conditioning. | `0.5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image | `any` |  |
| latent | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

