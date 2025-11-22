---
layout: page
title: "Stable Diffusion ControlNet (Img2Img)"
node_type: "huggingface.image_to_image.StableDiffusionControlNetImg2Img"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.StableDiffusionControlNetImg2Img`

**Namespace:** `huggingface.image_to_image`

## Description

Transforms existing images using Stable Diffusion with ControlNet guidance.
    image, generation, image-to-image, controlnet, SD, style-transfer

    Use cases:
    - Modify existing images with precise control over composition and structure
    - Apply specific styles or concepts to photographs or artwork with guided transformations
    - Create variations of existing visual content while maintaining certain features
    - Enhance image editing capabilities with AI-guided transformations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.stable_diffusion` | The model to use for image generation. | `{'type': 'hf.stable_diffusion', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| variant | `Enum['default', 'fp16', 'fp32', 'bf16']` | The variant of the model to use for generation. | `fp16` |
| prompt | `str` | The prompt for image generation. | `` |
| negative_prompt | `str` | The negative prompt to guide what should not appear in the generated image. | `` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed. | `-1` |
| num_inference_steps | `int` | Number of denoising steps. | `25` |
| guidance_scale | `float` | Guidance scale for generation. | `7.5` |
| scheduler | `Enum['DPMSolverSDEScheduler', 'EulerDiscreteScheduler', 'LMSDiscreteScheduler', 'DDIMScheduler', 'DDPMScheduler', 'HeunDiscreteScheduler', 'DPMSolverMultistepScheduler', 'DEISMultistepScheduler', 'PNDMScheduler', 'EulerAncestralDiscreteScheduler', 'UniPCMultistepScheduler', 'KDPM2DiscreteScheduler', 'DPMSolverSinglestepScheduler', 'KDPM2AncestralDiscreteScheduler']` | The scheduler to use for the diffusion process. | `EulerDiscreteScheduler` |
| loras | `List[hf.lora_sd_config]` | The LoRA models to use for image processing | `[]` |
| ip_adapter_model | `hf.ip_adapter` | The IP adapter model to use for image processing | `{'type': 'hf.ip_adapter', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| ip_adapter_image | `image` | When provided the image will be fed into the IP adapter | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| ip_adapter_scale | `float` | The strength of the IP adapter | `0.5` |
| pag_scale | `float` | Scale of the Perturbed-Attention Guidance applied to the image. | `3.0` |
| latents | `torch_tensor` | Optional initial latents to start generation from. | `{'type': 'torch_tensor', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| enable_attention_slicing | `bool` | Enable attention slicing for the pipeline. This can reduce VRAM usage. | `True` |
| enable_tiling | `bool` | Enable tiling for the VAE. This can reduce VRAM usage. | `True` |
| enable_cpu_offload | `bool` | Enable CPU offload for the pipeline. This can reduce VRAM usage. | `True` |
| output_type | `Enum['Image', 'Latent']` | The type of output to generate. | `Image` |
| image | `image` | The input image to be transformed. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| strength | `float` | Similarity to the input image | `0.5` |
| controlnet | `hf.controlnet` | The ControlNet model to use for guidance. | `{'type': 'hf.controlnet', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| control_image | `image` | The control image to guide the transformation. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image | `image` |  |
| latent | `torch_tensor` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

