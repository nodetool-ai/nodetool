---
layout: page
title: "Canvas Resize"
node_type: "nodetool.image.CanvasResize"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.CanvasResize`

**Namespace:** `nodetool.image`

## Description

Expand the canvas around an image without scaling its pixels.
    canvas, resize, pad, outpaint, expand

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to place on the expanded canvas. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| mode | `enum` | How to resize the canvas. | `padding` |
| width | `int` | Target canvas width (fixed mode). | `512` |
| height | `int` | Target canvas height (fixed mode). | `512` |
| scale | `float` | Canvas scale factor relative to the source image. | `1.25` |
| padding_unit | `enum` | Whether padding values are pixels or percent of source size. | `px` |
| top | `float` | Padding above the image. | `0` |
| bottom | `float` | Padding below the image. | `0` |
| left | `float` | Padding to the left of the image. | `0` |
| right | `float` | Padding to the right of the image. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
