---
layout: page
title: "Format Converter"
node_type: "nodetool.model3d.FormatConverter"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.FormatConverter`

**Namespace:** `nodetool.model3d`

## Description

Convert a 3D model between supported formats.
    3d, mesh, model, convert, format, glb, gltf, export

    Currently supported conversions: glb → gltf. Other targets are not yet implemented.

    Use cases:
    - Convert GLB to textual glTF for inspection
    - Export models as glTF for tool compatibility

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to convert | - |
| output_format | `enum` | Target format for conversion. Currently only glb → gltf is supported. | `glb` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
