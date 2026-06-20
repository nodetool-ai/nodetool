---
layout: page
title: "Rotate & Flip"
node_type: "nodetool.image.RotateAndFlip"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.RotateAndFlip`

**Namespace:** `nodetool.image`

## Description

Rotate and/or flip an image in a single step.
    image, rotate, flip, mirror, orientation, transform

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to rotate and flip. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| angle | `float` | Rotation angle in degrees (clockwise). | `0` |
| flip_horizontal | `bool` | Mirror left/right. | `false` |
| flip_vertical | `bool` | Mirror top/bottom. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
