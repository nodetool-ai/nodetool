---
layout: page
title: "MFlux Kontext"
node_type: "mlx.image_to_image.MFluxKontext"
namespace: "mlx.image_to_image"
---

**Type:** `mlx.image_to_image.MFluxKontext`

**Namespace:** `mlx.image_to_image`

## Description

Generate images using Kontext reference image fusion on Apple Silicon.
    mlx, flux, kontext, reference guidance

    Use cases:
    - Leverage a reference image and prompt to produce stylistically consistent outputs
    - Perform context-aware edits without external services
    - Prototype Kontext-driven workflows locally

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `str` | Primary text prompt for Kontext-guided generation. | `Create an atmospheric scene based on the reference image` |
| reference_image | `image` | Reference image that will guide the Kontext generation. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| model | `hf.flux_kontext` | Kontext model weights compatible with the Flux Kontext pipeline. | `{'type': 'hf.flux_kontext', 'repo_id': 'black-forest-labs/FLUX.1-Kontext-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| quantize | `Optional[Enum[3, 4, 5, 6, 8]]` | Optional quantization level for model weights (reduces memory usage). | `4` |
| steps | `int` | Number of denoising steps for the generation run. | `20` |
| guidance | `Optional[float]` | Classifier-free guidance scale. Kontext often works best with moderate values. | `2.5` |
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

