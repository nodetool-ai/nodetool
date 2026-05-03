---
layout: page
title: "Decimate"
node_type: "nodetool.model3d.Decimate"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.Decimate`

**Namespace:** `nodetool.model3d`

## Description

Reduce polygon count while preserving shape using meshoptimizer-backed simplification.
    3d, mesh, model, decimate, simplify, reduce, polygon, optimize, LOD

    Set target_vertices > 0 to target an exact vertex count instead of a ratio.

    Use cases:
    - Create level-of-detail (LOD) versions
    - Optimize models for real-time rendering
    - Reduce file size for web deployment
    - Prepare models for mobile/VR applications

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to decimate | - |
| target_ratio | `float` | Target ratio of faces to keep (0.5 = 50% reduction). Ignored when target_vertices is set. | `0.5` |
| target_vertices | `int` | Approximate target vertex count. Overrides target_ratio when > 0. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
