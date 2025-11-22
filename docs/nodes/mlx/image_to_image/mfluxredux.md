---
layout: page
title: "MFlux Redux"
node_type: "mlx.image_to_image.MFluxRedux"
namespace: "mlx.image_to_image"
---

**Type:** `mlx.image_to_image.MFluxRedux`

**Namespace:** `mlx.image_to_image`

## Description

Generate images using reference images with Flux Redux guidance on Apple Silicon.
    mlx, flux, redux, reference fusion

    Use cases:
    - Blend multiple reference images with a text prompt to steer style and content
    - Reinterpret a photo collection into a coherent output while keeping structure from the references
    - Experiment locally with the Flux Redux pipeline without external APIs

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `any` | Primary text prompt for the Redux generation. | `Create a cinematic composition inspired by the reference images` |
| redux_image | `any` | Reference image that will guide the generation. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| redux_image_strength | `any` | Optional strength value (0-1) for the reference image. | - |
| model | `any` | Redux model variant to load. Defaults to FLUX.1 Redux dev weights. | `{'type': 'hf.flux_redux', 'repo_id': 'black-forest-labs/FLUX.1-Redux-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| quantize | `any` | Optional quantization level for model weights (reduces memory usage). | `4` |
| steps | `any` | Number of denoising steps for the generation run. | `20` |
| guidance | `any` | Classifier-free guidance scale. A moderate default balances prompt adherence and references. | `7.0` |
| height | `any` | Height of the generated image in pixels. | `1024` |
| width | `any` | Width of the generated image in pixels. | `1024` |
| seed | `any` | Seed for deterministic generation. Leave 0 for random seed. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.image_to_image](../) namespace.

