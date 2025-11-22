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
| prompt | `str` | Text prompt describing what to generate inside the mask. | `Refine the masked region with additional details` |
| image | `image` | Base image that will stay fixed outside the masked regions. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| mask | `image` | Mask image: white areas will be regenerated, black areas remain untouched. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| model | `hf.inpainting` | Inpainting model to load. Defaults to FLUX.1 Fill dev weights. | `{'type': 'hf.inpainting', 'repo_id': 'black-forest-labs/FLUX.1-Fill-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| quantize | `Optional[Enum[3, 4, 5, 6, 8]]` | Optional quantization level for model weights (reduces memory usage). | `4` |
| steps | `int` | Number of denoising steps for the inpainting run. | `20` |
| guidance | `Optional[float]` | Classifier-free guidance scale. Higher values tend to better respect the prompt in Fill mode. | `30.0` |
| height | `int` | Target output height in pixels. | `1024` |
| width | `int` | Target output width in pixels. | `1024` |
| seed | `int` | Seed for deterministic generation. Leave 0 for random seed. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.image_to_image](../) namespace.

