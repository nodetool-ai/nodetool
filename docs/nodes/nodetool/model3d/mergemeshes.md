---
layout: page
title: "Merge Meshes"
node_type: "nodetool.model3d.MergeMeshes"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.MergeMeshes`

**Namespace:** `nodetool.model3d`

## Description

Merge multiple meshes into a single GLB scene.
    3d, mesh, model, merge, combine, concatenate

    Current limits:
    - First honest pass supports GLB input only
    - This node performs scene merge, not boolean union

    Use cases:
    - Combine multiple parts into one model
    - Merge imported components
    - Prepare models for downstream processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| models | `list[model_3d]` | List of 3D models to merge | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
