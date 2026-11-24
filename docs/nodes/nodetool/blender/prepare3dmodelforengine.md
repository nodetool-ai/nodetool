---
layout: page
title: "Prepare 3D Model For Engine"
node_type: "nodetool.blender.PrepareForEngine"
namespace: "nodetool.blender"
---

**Type:** `nodetool.blender.PrepareForEngine`

**Namespace:** `nodetool.blender`

## Description

Prepare a 3D model (GLB/glTF) for a game engine with Blender: decimate to a face budget, unwrap UVs, bake AO and normal maps, and emit LODs at halving face counts.
    3d, mesh, decimate, unwrap, bake, lod, glb, game, engine, blender

    Use cases:
    - Shrink a generated mesh to a face budget for a game engine
    - Bake AO and normal maps into the materials
    - Emit LODs alongside the prepared model

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to prepare (GLB or glTF with embedded buffers) | - |
| target_faces | `int` | Face budget every mesh is decimated toward; meshes already under it are left alone | `5000` |
| unwrap | `bool` | UV-unwrap every mesh (smart project) before baking; baking projects missing UVs anyway | `true` |
| bake | `enum` | Maps to bake into the materials at Bake Resolution: none, ao (occlusion multiplied into base color), normal (tangent-space normal map), or both | `none` |
| bake_resolution | `int` | Width and height in pixels of each baked map | `1024` |
| lod_count | `int` | How many LODs to emit alongside the model, at halving face targets (LOD 1 is half the prepared faces, LOD 2 a quarter, and so on) | `0` |
| timeout | `int` | Maximum preparation time in seconds | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| model | `model_3d` |  |
| lods | `list[model_3d]` |  |

## Related Nodes

Browse other nodes in the [nodetool.blender](./) namespace.
