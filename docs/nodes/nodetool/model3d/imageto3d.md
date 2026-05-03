---
layout: page
title: "Image To 3D"
node_type: "nodetool.model3d.ImageTo3D"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.ImageTo3D`

**Namespace:** `nodetool.model3d`

## Description

Generate 3D models from images using AI providers (Meshy, Rodin).
    3d, generation, AI, image-to-3d, i3d, mesh, reconstruction

    Use cases:
    - Convert product photos to 3D models
    - Create 3D assets from concept art
    - Generate 3D characters from drawings
    - Reconstruct objects from images

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d_model` | The 3D generation model to use | - |
| image | `image` | Input image to convert to 3D | - |
| prompt | `str` | Optional text prompt to guide the 3D generation | `` |
| output_format | `enum` | Output format for the 3D model | `glb` |
| seed | `int` | Random seed for reproducibility (-1 for random) | `-1` |
| timeout_seconds | `int` | Timeout in seconds for API calls (0 = use provider default) | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
