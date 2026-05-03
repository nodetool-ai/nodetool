---
layout: page
title: "Extract Largest Component"
node_type: "nodetool.model3d.ExtractLargestComponent"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.ExtractLargestComponent`

**Namespace:** `nodetool.model3d`

## Description

Keep only the largest disconnected triangle component of a 3D mesh.
    3d, mesh, model, cleanup, component, connected, floater, islands

    Current limits:
    - First honest pass supports GLB triangle geometry only
    - Output rebuilds triangle geometry and does not preserve all original attributes/material setup

    Use cases:
    - Remove disconnected floaters from AI-generated meshes
    - Keep the primary object from noisy geometry
    - Clean up multi-island outputs before downstream processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to clean up | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
