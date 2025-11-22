---
layout: page
title: "MFlux ControlNet"
node_type: "mlx.image_to_image.MFluxControlNet"
namespace: "mlx.image_to_image"
---

**Type:** `mlx.image_to_image.MFluxControlNet`

**Namespace:** `mlx.image_to_image`

## Description

Generate images with MFlux ControlNet guidance using local MLX acceleration.
    mlx, flux, controlnet, conditioning, edge-detection

    Use cases:
    - Apply edge-aware guidance via ControlNet canny models
    - Leverage local Apple Silicon acceleration for conditioned generations
    - Upscale images using ControlNet upscaler weights

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `any` | Primary text prompt for image generation. | `Highly detailed cinematic portrait` |
| control_image | `any` | Reference image used by ControlNet for conditioning. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| model | `any` | Base Flux model to load for conditioned generation. | `{'type': 'hf.flux', 'repo_id': 'dhairyashil/FLUX.1-dev-mflux-4bit', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| controlnet_model | `any` | ControlNet weights that match the selected Flux base model. | `{'type': 'hf.controlnet_flux', 'repo_id': 'InstantX/FLUX.1-dev-Controlnet-Canny', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| quantize | `any` | Optional quantization level for model weights (reduces memory usage). | `4` |
| steps | `any` | Number of denoising steps for diffusion. | `8` |
| guidance | `any` | Classifier-free guidance scale when supported by the selected model. | `3.5` |
| controlnet_strength | `any` | Blend factor between ControlNet conditioning and base model prior. | `0.5` |
| height | `any` | Height of the generated image in pixels. | `1024` |
| width | `any` | Width of the generated image in pixels. | `1024` |
| seed | `any` | Seed for deterministic generation. Leave 0 for random. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.image_to_image](../) namespace.

