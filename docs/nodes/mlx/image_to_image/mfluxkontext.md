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
| prompt | `any` | Primary text prompt for Kontext-guided generation. | `Create an atmospheric scene based on the reference image` |
| reference_image | `any` | Reference image that will guide the Kontext generation. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| model | `any` | Kontext model weights compatible with the Flux Kontext pipeline. | `{'type': 'hf.flux_kontext', 'repo_id': 'black-forest-labs/FLUX.1-Kontext-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| quantize | `any` | Optional quantization level for model weights (reduces memory usage). | `4` |
| steps | `any` | Number of denoising steps for the generation run. | `20` |
| guidance | `any` | Classifier-free guidance scale. Kontext often works best with moderate values. | `2.5` |
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

