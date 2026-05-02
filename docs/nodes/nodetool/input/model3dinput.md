---
layout: page
title: "Model 3D Input"
node_type: "nodetool.input.Model3DInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.Model3DInput`

**Namespace:** `nodetool.input`

## Description

Accepts a reference to a 3D model asset for workflows, specified by a 'Model3DRef'.
    A 'Model3DRef' points to 3D model data that can be used for visualization, processing,
    or conversion by 3D-capable nodes.
    input, parameter, 3d, model, mesh, obj, glb, stl, ply, asset

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `model_3d` | The 3D model to use as input. | `{"type":"model_3d","uri":"","asset_id":null,"da...` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.
