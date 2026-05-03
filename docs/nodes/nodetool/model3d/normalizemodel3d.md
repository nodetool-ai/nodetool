---
layout: page
title: "Normalize Model 3D"
node_type: "nodetool.model3d.NormalizeModel3D"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.NormalizeModel3D`

**Namespace:** `nodetool.model3d`

## Description

Normalize a 3D model with explicit axis cleanup, centering, optional uniform scaling, and optional ground placement.
    3d, mesh, model, normalize, center, scale, orient, ground

    Current limits:
    - First honest pass supports GLB geometry cleanup only
    - Axis normalization is explicit (`keep`, `z_to_y`, `y_to_z`), not auto-detected

    Use cases:
    - Standardize imported GLB orientation
    - Fit meshes into a predictable size box
    - Center models before downstream processing
    - Place meshes onto a chosen ground axis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to normalize | - |
| center_mode | `enum` | How to center the model before optional scaling | `bounds` |
| axis_preset | `enum` | Explicit orientation normalization preset | `keep` |
| scale_to_size | `bool` | Scale the model uniformly so its longest bounds dimension matches the target size | `true` |
| target_size | `float` | Longest bounds dimension after optional uniform scaling | `1` |
| place_on_ground | `bool` | Translate the mesh so the chosen ground axis minimum becomes zero | `true` |
| ground_axis | `enum` | Axis treated as the up/ground direction for placement | `y` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
