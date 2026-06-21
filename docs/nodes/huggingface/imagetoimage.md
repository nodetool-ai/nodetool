---
layout: page
title: "Image to Image"
node_type: "huggingface.ImageToImage"
namespace: "huggingface"
---

**Type:** `huggingface.ImageToImage`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Image-to-image model repo id. | `black-forest-labs/FLUX.1-Kontext-dev` |
| image | `image` | The source image to transform. | - |
| prompt | `str` | Text prompt guiding the transformation. | `` |
| negative_prompt | `str` | What the result should NOT contain. | `` |
| guidance_scale | `float` | How closely to follow the prompt (0 = model default). | `0` |
| num_inference_steps | `int` | Number of denoising steps (0 = model default). | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
