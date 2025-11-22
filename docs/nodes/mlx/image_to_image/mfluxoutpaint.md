---
layout: page
title: "MFlux Outpaint"
node_type: "mlx.image_to_image.MFluxOutpaint"
namespace: "mlx.image_to_image"
---

**Type:** `mlx.image_to_image.MFluxOutpaint`

**Namespace:** `mlx.image_to_image`

## Description

Outpaint an existing image by extending the canvas using the MFLUX Fill pipeline.
    mlx, flux, outpainting, canvas extension

    Use cases:
    - Expand scene borders while maintaining continuity with the original image
    - Add sky, foreground elements, or contextual scenery around a provided image

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `str` | Prompt guiding what to generate in the newly added canvas regions. | `Expand the scene with complementary surroundings` |
| image | `image` | Base image that will remain visible inside the padded region. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| mask | `image` | Mask defining areas to regenerate (white) after padding. If blank, generated automatically. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| model | `hf.inpainting` | Outpainting model to load. Defaults to FLUX.1 Fill dev weights. | `{'type': 'hf.inpainting', 'repo_id': 'black-forest-labs/FLUX.1-Fill-dev', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| quantize | `Optional[Enum[3, 4, 5, 6, 8]]` | Optional quantization level for model weights (reduces memory usage). | `4` |
| steps | `int` | Number of denoising steps for the outpainting run. | `20` |
| guidance | `Optional[float]` | Classifier-free guidance scale. Higher values tend to better respect the prompt in Fill mode. | `30.0` |
| padding | `Optional[str]` | CSS-style padding string (e.g. '128', '96,64', '10%,5%') describing additional canvas to create before generation. | - |
| height | `int` | Target output height after padding. | `1024` |
| width | `int` | Target output width after padding. | `1024` |
| seed | `int` | Seed for deterministic generation. Leave 0 for random seed. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.image_to_image](../) namespace.

