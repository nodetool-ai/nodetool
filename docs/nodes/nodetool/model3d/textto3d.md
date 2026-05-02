---
layout: page
title: "Text To 3D"
node_type: "nodetool.model3d.TextTo3D"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.TextTo3D`

**Namespace:** `nodetool.model3d`

## Description

Generate 3D models from text prompts using AI providers (Meshy, Rodin).
    3d, generation, AI, text-to-3d, t3d, mesh, create

    Use cases:
    - Create 3D models from text descriptions
    - Generate game assets from prompts
    - Prototype 3D concepts quickly
    - Create 3D content for AR/VR

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d_model` | The 3D generation model to use | - |
| prompt | `str` | Text description of the 3D model to generate | `` |
| negative_prompt | `str` | Elements to avoid in the generated model | `` |
| art_style | `str` | Art style for the model (e.g., 'realistic', 'cartoon', 'low-poly') | `` |
| output_format | `enum` | Output format for the 3D model | `glb` |
| enable_textures | `bool` | Generate PBR textures after shape generation (Meshy only; adds a second API call) | `true` |
| seed | `int` | Random seed for reproducibility (-1 for random) | `-1` |
| timeout_seconds | `int` | Timeout in seconds for API calls (0 = use provider default) | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
