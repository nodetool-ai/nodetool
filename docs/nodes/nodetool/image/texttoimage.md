---
layout: page
title: "Text To Image"
node_type: "nodetool.image.TextToImage"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.TextToImage`

**Namespace:** `nodetool.image`

## Description

Generate images from text prompts using any supported image provider. Automatically routes to the appropriate backend (HuggingFace, FAL, MLX).
    image, generation, AI, text-to-image, t2i

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `image_model` | The image generation model to use | `{"type":"image_model","provider":"huggingface_f...` |
| prompt | `str` | Text prompt describing the desired image | `A cat holding a sign that says hello world` |
| negative_prompt | `str` | Text prompt describing what to avoid in the image | `` |
| aspect_ratio | `str` | Aspect ratio of the generated image | `1:1` |
| resolution | `str` | Output resolution (short edge in pixels) | `1K` |
| timeout_seconds | `int` | Timeout in seconds for API calls (0 = use provider default) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.
