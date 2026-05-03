---
layout: page
title: "Center Mesh"
node_type: "nodetool.model3d.CenterMesh"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.CenterMesh`

**Namespace:** `nodetool.model3d`

## Description

Center a mesh at the origin.
    3d, mesh, model, center, origin, align

    Use cases:
    - Center models for consistent positioning
    - Prepare models for rotation
    - Align multiple models

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to center | - |
| use_centroid | `bool` | Use geometric centroid (True) or bounding box center (False) | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
