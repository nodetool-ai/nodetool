---
layout: page
title: "Boolean 3D"
node_type: "nodetool.model3d.Boolean3D"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.Boolean3D`

**Namespace:** `nodetool.model3d`

## Description

Perform boolean operations on 3D meshes.
    3d, mesh, model, boolean, union, difference, intersection, combine, subtract

    Current limits:
    - First honest pass supports GLB triangle meshes only
    - Boolean output preserves geometry, not full material/attribute fidelity

    Use cases:
    - Combine multiple objects (union)
    - Cut holes in objects (difference)
    - Find overlapping regions (intersection)
    - Hard-surface modeling operations
    - 3D printing preparation

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model_a | `model_3d` | First 3D model (base) | - |
| model_b | `model_3d` | Second 3D model (tool) | - |
| operation | `enum` | Boolean operation to perform | `union` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
