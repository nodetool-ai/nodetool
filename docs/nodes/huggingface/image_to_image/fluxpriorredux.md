---
layout: page
title: "Flux Prior Redux"
node_type: "huggingface.image_to_image.FluxPriorRedux"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.FluxPriorRedux`

**Namespace:** `huggingface.image_to_image`

## Description

Performs image transformation using FLUX Prior Redux pipeline for image-conditioned generation.
    image, transformation, flux, redux, prior, image-conditioned, generation

    Use cases:
    - Transform images using FLUX Prior Redux for style transfer and image variations
    - Generate images conditioned on reference images without text prompts
    - High-quality image-to-image transformation with FLUX models
    - Create variations of existing images with FLUX Prior Redux guidance

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prior_redux_model | `hf.flux_redux` | The FLUX Prior Redux model to use for image conditioning. | `{'type': 'hf.flux_redux', 'repo_id': 'black-forest-labs/FLUX.1-Redux-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| flux_model | `hf.flux` | The FLUX base model to use for generation. | `{'type': 'hf.flux', 'repo_id': 'black-forest-labs/FLUX.1-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | The input image to transform | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| guidance_scale | `float` | Guidance scale for generation. Higher values follow the prior more closely | `2.5` |
| num_inference_steps | `int` | Number of denoising steps | `50` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed | `-1` |
| enable_cpu_offload | `bool` | Enable CPU offload to reduce VRAM usage. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

