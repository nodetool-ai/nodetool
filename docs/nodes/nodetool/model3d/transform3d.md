---
layout: page
title: "Transform 3D"
node_type: "nodetool.model3d.Transform3D"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.Transform3D`

**Namespace:** `nodetool.model3d`

## Description

Apply translation, rotation, and scaling to a 3D model.
    3d, mesh, model, transform, translate, rotate, scale, move

    Use cases:
    - Position models in 3D space
    - Scale models to specific dimensions
    - Rotate models for proper orientation

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to transform | - |
| translate_x | `float` | Translation along X axis | `0` |
| translate_y | `float` | Translation along Y axis | `0` |
| translate_z | `float` | Translation along Z axis | `0` |
| rotate_x | `float` | Rotation around X axis in degrees | `0` |
| rotate_y | `float` | Rotation around Y axis in degrees | `0` |
| rotate_z | `float` | Rotation around Z axis in degrees | `0` |
| scale_x | `float` | Scale factor along X axis | `1` |
| scale_y | `float` | Scale factor along Y axis | `1` |
| scale_z | `float` | Scale factor along Z axis | `1` |
| uniform_scale | `float` | Uniform scale factor (applied after axis scales) | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
