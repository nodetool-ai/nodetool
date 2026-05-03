---
layout: page
title: "Repair Mesh"
node_type: "nodetool.model3d.RepairMesh"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.RepairMesh`

**Namespace:** `nodetool.model3d`

## Description

Apply conservative mesh cleanup passes to remove obviously broken GLB triangle geometry.
    3d, mesh, model, repair, cleanup, weld, degenerate, duplicate

    Current limits:
    - First honest pass supports GLB triangle geometry only
    - Repair is intentionally conservative: near-duplicate vertex merge plus degenerate-face removal
    - Output rebuilds triangle geometry and does not preserve all original attributes/material setup

    Use cases:
    - Clean up noisy AI-generated meshes before export
    - Weld tiny duplicate seams in simple geometry
    - Remove zero-area or collapsed triangles

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to repair | - |
| merge_duplicate_vertices | `bool` | Merge exact or near-duplicate vertices before other cleanup | `true` |
| remove_degenerate_faces | `bool` | Drop triangles with repeated vertices or near-zero area | `true` |
| position_tolerance | `float` | Tolerance used for near-duplicate vertex welding and degenerate checks | `0.0001` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
