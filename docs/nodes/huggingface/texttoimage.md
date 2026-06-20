---
layout: page
title: "Text to Image"
node_type: "huggingface.TextToImage"
namespace: "huggingface"
---

**Type:** `huggingface.TextToImage`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Text-to-image model repo id (e.g. black-forest-labs/FLUX.1-schnell, stabilityai/stable-diffusion-xl-base-1.0). | `black-forest-labs/FLUX.1-schnell` |
| prompt | `str` | The text prompt describing the image. | `` |
| negative_prompt | `str` | What the image should NOT contain. | `` |
| width | `int` | Output width in pixels (0 = model default). | `0` |
| height | `int` | Output height in pixels (0 = model default). | `0` |
| guidance_scale | `float` | How closely to follow the prompt (0 = model default). | `0` |
| num_inference_steps | `int` | Number of denoising steps (0 = model default). | `0` |
| seed | `int` | Random seed (-1 = random). | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
