---
layout: page
title: "Upscale Image"
node_type: "nodetool.image.Upscale"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Upscale`

**Namespace:** `nodetool.image`

## Description

Increase the resolution and detail of an image using any supported upscaling provider.
    image, upscale, super-resolution, enhance, AI

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `image_model` | The upscaling model to use | `{"type":"image_model","provider":"fal_ai","id":...` |
| image | `image` | Input image to upscale | `{"type":"image","uri":"","asset_id":null,"data"...` |
| scale | `int` | Target magnification factor | `2` |
| prompt | `str` | Optional guidance prompt for creative upscalers | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
