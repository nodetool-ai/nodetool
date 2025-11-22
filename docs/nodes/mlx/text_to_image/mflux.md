---
layout: page
title: "MFlux"
node_type: "mlx.text_to_image.MFlux"
namespace: "mlx.text_to_image"
---

**Type:** `mlx.text_to_image.MFlux`

**Namespace:** `mlx.text_to_image`

## Description

Generate images locally using the MFLUX MLX implementation of FLUX.1.
    mlx, flux, image generation, apple-silicon

    Use cases:
    - Create high quality images on Apple Silicon without external APIs
    - Prototype prompts locally before running on cloud inference providers
    - Experiment with quantized FLUX models (schnell/dev/krea-dev variants)

    Recommended models:
    - schnell: Fastest model, good for quick generations (2-4 steps)
    - dev: More powerful model, higher quality (20-25 steps)
    - krea-dev: Enhanced photorealism with distinctive aesthetics
    - Quantized 4-bit models: Reduced memory usage versions of the official models

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `str` | The text prompt describing the image to generate. | `A vivid concept art piece of a futuristic city at sunset` |
| model | `hf.flux` | MFLUX model variant to load | `{'type': 'hf.flux', 'repo_id': 'dhairyashil/FLUX.1-schnell-mflux-v0.6.2-4bit', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| quantize | `Enum[3, 4, 5, 6, 8]` | Optional quantization level for model weights (reduces memory usage). | `4` |
| steps | `int` | Number of denoising steps for the generation run. | `4` |
| guidance | `Optional[float]` | Classifier-free guidance scale. Used by dev/krea-dev models. | `3.5` |
| height | `int` | Height of the generated image in pixels. | `1024` |
| width | `int` | Width of the generated image in pixels. | `1024` |
| seed | `int` | Seed for deterministic generation. Leave as 0 for random. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.text_to_image](../) namespace.

