---
layout: page
title: "Sketch"
node_type: "nodetool.constant.Sketch"
namespace: "nodetool.constant"
---

**Type:** `nodetool.constant.Sketch`

**Namespace:** `nodetool.constant`

## Description

Layered sketch document for drawing, masking, and image composition.
    sketch, drawing, canvas, paint, image editor

    Use cases:
    - Pass a sketch document between nodes
    - Edit the sketch directly from the workflow canvas
    - Expose flattened image, mask, and layer outputs for downstream nodes

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `sketch` |  | - |
| sketch_data | `str` | Serialized editor document (managed by the UI). | `` |
| image | `image` | Flattened composite (filled when you edit in the UI). | - |
| mask | `image` | Mask output when configured in the editor. | - |
| layers | `list` | List of exposed layer image references. | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `sketch` |  |
| image | `image` |  |
| mask | `image` |  |
| layers | `list[image]` |  |

## Related Nodes

Browse other nodes in the [nodetool.constant](./) namespace.
