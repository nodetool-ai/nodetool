---
layout: page
title: "MFlux Depth"
node_type: "mlx.image_to_image.MFluxDepth"
namespace: "mlx.image_to_image"
---

**Type:** `mlx.image_to_image.MFluxDepth`

**Namespace:** `mlx.image_to_image`

## Description

Generate images with depth guidance via the MFlux depth pipeline using local MLX acceleration.
    mlx, flux, depth, conditioning, structure-preserving

    Use cases:
    - Use a depth map to control structural composition while keeping prompt-driven appearance
    - Provide both source image and depth map to transfer scene layout to a new generation
    - Generate depth-guided outputs when only a depth map is available (source image optional)

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `str` | Primary text prompt for the depth-guided generation. | `Highly detailed cinematic portrait with depth cues` |
| image | `image` | Optional reference image used for depth extraction or as a content guide. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| depth_image | `image` | Optional depth map to guide geometry. If omitted, depth is inferred from the image when provided. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| model | `hf.flux_depth` | Depth model weights compatible with the Flux depth pipeline. | `{'type': 'hf.flux_depth', 'repo_id': 'black-forest-labs/FLUX.1-Depth-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| quantize | `Optional[Enum[3, 4, 5, 6, 8]]` | Optional quantization level for model weights (reduces memory usage). | `4` |
| steps | `int` | Number of denoising steps for the generation run. | `20` |
| guidance | `Optional[float]` | Classifier-free guidance scale. Defaults higher to encourage prompt adherence in depth mode. | `10.0` |
| height | `int` | Height of the generated image in pixels. | `1024` |
| width | `int` | Width of the generated image in pixels. | `1024` |
| seed | `int` | Seed for deterministic generation. Leave 0 for random seed. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.image_to_image](../) namespace.

