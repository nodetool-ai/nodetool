---
layout: page
title: "MFlux Inpaint"
node_type: "mlx.image_to_image.MFluxInpaint"
namespace: "mlx.image_to_image"
---

**Type:** `mlx.image_to_image.MFluxInpaint`

**Namespace:** `mlx.image_to_image`

## Description

Inpaint portions of an image locally using the MFLUX MLX implementation of FLUX.1 Fill.
    mlx, flux, inpainting, mask editing

    Use cases:
    - Restore masked regions with prompt-guided content
    - Blend new elements into an existing composition while preserving unmasked areas

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `any` | Text prompt describing what to generate inside the mask. | `Refine the masked region with additional details` |
| image | `any` | Base image that will stay fixed outside the masked regions. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| mask | `any` | Mask image: white areas will be regenerated, black areas remain untouched. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| model | `any` | Inpainting model to load. Defaults to FLUX.1 Fill dev weights. | `{'type': 'hf.inpainting', 'repo_id': 'black-forest-labs/FLUX.1-Fill-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| quantize | `any` | Optional quantization level for model weights (reduces memory usage). | `4` |
| steps | `any` | Number of denoising steps for the inpainting run. | `20` |
| guidance | `any` | Classifier-free guidance scale. Higher values tend to better respect the prompt in Fill mode. | `30.0` |
| height | `any` | Target output height in pixels. | `1024` |
| width | `any` | Target output width in pixels. | `1024` |
| seed | `any` | Seed for deterministic generation. Leave 0 for random seed. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.image_to_image](../) namespace.

