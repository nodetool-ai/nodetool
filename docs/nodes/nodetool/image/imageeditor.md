---
layout: page
title: "Image Editor"
node_type: "nodetool.image.ImageEditor"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.ImageEditor`

**Namespace:** `nodetool.image`

## Description

Layered sketch and image editor: draw, paint, mask, and composite.
    sketch, image editor, draw, paint, layers, mask, canvas, composite

    - Build masks for inpainting workflows
    - Annotate or rough-in compositions before generation
    - Per-layer inputs/outputs when exposed in the editor

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| sketch_data | `str` | Serialized editor document (managed by the UI). | `` |
| image | `image` | Flattened composite (filled when you edit in the UI). | `{"type":"image","uri":"","asset_id":null,"data"...` |
| mask | `image` | Mask output when configured in the editor. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| layers | `list` | List of exposed layer image references. | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image | `image` |  |
| mask | `image` |  |
| layers | `list[image]` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
