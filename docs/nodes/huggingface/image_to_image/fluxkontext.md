---
layout: page
title: "Flux Kontext"
node_type: "huggingface.image_to_image.FluxKontext"
namespace: "huggingface.image_to_image"
---

**Type:** `huggingface.image_to_image.FluxKontext`

**Namespace:** `huggingface.image_to_image`

## Description

Performs image editing using FLUX Kontext models for context-aware image generation.
    image, editing, flux, kontext, context-aware, generation

    Use cases:
    - Edit images based on reference context
    - Add elements to images guided by prompts
    - Context-aware image modifications
    - High-quality image editing with FLUX models

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.flux_kontext` | The FLUX Kontext model to use for image editing. | `{'type': 'hf.flux_kontext', 'repo_id': 'black-forest-labs/FLUX.1-Kontext-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | The input image to edit | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `str` | Text description of the desired edit to apply to the image | `Add a hat to the cat` |
| guidance_scale | `float` | Guidance scale for editing. Higher values follow the prompt more closely | `2.5` |
| seed | `int` | Seed for the random number generator. Use -1 for a random seed | `-1` |
| enable_cpu_offload | `bool` | Enable CPU offload to reduce VRAM usage. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_to_image](../) namespace.

