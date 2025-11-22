---
layout: page
title: "MFlux ImageToImage"
node_type: "mlx.image_to_image.MFluxImageToImage"
namespace: "mlx.image_to_image"
---

**Type:** `mlx.image_to_image.MFluxImageToImage`

**Namespace:** `mlx.image_to_image`

## Description

Transform an existing image using the MFLUX MLX implementation of FLUX.1.
    mlx, flux, image-to-image, apple-silicon

    Use cases:
    - Apply prompt-based edits to an existing image without relying on external APIs
    - Experiment with strength-controlled transformations locally

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `any` | Text prompt describing how to transform the input image. | `Refine this image with cinematic lighting` |
| image | `any` | Base image that will be transformed. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| model | `any` | MFLUX model variant to load for image-to-image generation. | `{'type': 'hf.flux', 'repo_id': 'dhairyashil/FLUX.1-dev-mflux-4bit', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| quantize | `any` | Optional quantization level for model weights (reduces memory usage). | `4` |
| steps | `any` | Number of denoising steps for the transformation. | `8` |
| guidance | `any` | Classifier-free guidance scale. Used by dev/krea-dev models. | `3.5` |
| image_strength | `any` | Blend factor between the original image and the generation (0 keeps original). | `0.4` |
| height | `any` | Height of the generated image in pixels. | `1024` |
| width | `any` | Width of the generated image in pixels. | `1024` |
| seed | `any` | Seed for deterministic generation. Leave as 0 for random. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.image_to_image](../) namespace.

