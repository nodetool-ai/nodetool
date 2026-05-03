---
layout: page
title: "Image To Image"
node_type: "nodetool.image.ImageToImage"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.ImageToImage`

**Namespace:** `nodetool.image`

## Description

Transform images using text prompts with any supported image provider. Automatically routes to the appropriate backend (HuggingFace, FAL, MLX).
    image, transformation, AI, image-to-image, i2i

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `image_model` | The image generation model to use | `{"type":"image_model","provider":"huggingface_f...` |
| image | `image` | Input image to transform | `{"type":"image","uri":"","asset_id":null,"data"...` |
| prompt | `str` | Text prompt describing the desired transformation | `A photorealistic version of the input image` |
| negative_prompt | `str` | Text prompt describing what to avoid | `` |
| strength | `float` | How much to transform the input image (subtle = minor edit, strong = major edit) | `0.65` |
| aspect_ratio | `str` | Aspect ratio of the output image | `1:1` |
| resolution | `str` | Output resolution (short edge in pixels) | `1K` |
| scheduler | `str` | Scheduler to use (provider-specific) | `` |
| timeout_seconds | `int` | Timeout in seconds for API calls (0 = use provider default) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.
