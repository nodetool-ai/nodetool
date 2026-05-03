---
layout: page
title: "Flip Normals"
node_type: "nodetool.model3d.FlipNormals"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.FlipNormals`

**Namespace:** `nodetool.model3d`

## Description

Flip all face normals of a mesh.
    3d, mesh, model, normals, flip, invert, inside_out

    Use cases:
    - Fix inside-out meshes
    - Invert normals for specific rendering effects
    - Repair meshes from incompatible software

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to process | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
