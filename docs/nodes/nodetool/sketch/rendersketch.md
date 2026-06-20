---
layout: page
title: "Render Sketch"
node_type: "nodetool.sketch.RenderSketch"
namespace: "nodetool.sketch"
---

**Type:** `nodetool.sketch.RenderSketch`

**Namespace:** `nodetool.sketch`

## Description

Render a sketch document to a flat image (plus its mask layer when one is set).
    sketch, render, flatten, image, mask

    Use cases:
    - Use a hand-drawn sketch as input for image generation (img2img, ControlNet-style guidance)
    - Produce an inpainting mask painted in the sketch editor
    - Turn editor compositions into workflow images without manual exporting

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| sketch | `sketch` | The sketch document to render. | `{"type":"sketch","id":null,"data":null}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image | `image` |  |
| mask | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.sketch](./) namespace.
