---
layout: page
title: "Recalculate Normals"
node_type: "nodetool.model3d.RecalculateNormals"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.RecalculateNormals`

**Namespace:** `nodetool.model3d`

## Description

Recalculate mesh normals for proper shading.
    3d, mesh, model, normals, fix, shading, smooth, flat, faces

    Use cases:
    - Fix inverted or broken normals
    - Switch between smooth and flat shading
    - Repair imported meshes with bad normals
    - Prepare models for rendering

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to process | - |
| mode | `enum` | Shading mode: smooth, flat, or auto (uses mesh default) | `auto` |
| fix_winding | `bool` | Fix inconsistent face winding (inverted faces) | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
