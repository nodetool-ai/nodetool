---
layout: page
title: "Export 3D Model With Blender"
node_type: "nodetool.blender.ExportModel"
namespace: "nodetool.blender"
---

**Type:** `nodetool.blender.ExportModel`

**Namespace:** `nodetool.blender`

## Description

Export a 3D model (GLB/glTF) to FBX, OBJ, or USD with Blender, persisted as a stored asset.
    3d, mesh, model, export, fbx, obj, usd, file, blender

    Use cases:
    - Hand a generated mesh to a game engine as FBX
    - Export an OBJ for tools without glTF support
    - Export USD for pipelines built on it

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to export (GLB or glTF with embedded buffers) | - |
| format | `enum` | Export format: fbx, obj, or usd (OBJ is geometry-only, no .mtl; GLB stays a Model3DRef — see Prepare For Engine) | `fbx` |
| timeout | `int` | Maximum export time in seconds | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| file | `asset` |  |

## Related Nodes

Browse other nodes in the [nodetool.blender](./) namespace.
