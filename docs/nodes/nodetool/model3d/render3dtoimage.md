---
layout: page
title: "Render 3D To Image"
node_type: "nodetool.model3d.RenderToImage"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.RenderToImage`

**Namespace:** `nodetool.model3d`

## Description

Render a 3D model (GLB/glTF) to an image with an orbit camera and studio lighting — no grid, axes, or gizmos.
    3d, render, image, camera, light, snapshot, thumbnail, turntable

    Use cases:
    - Turn generated 3D models into shareable images
    - Produce thumbnails for 3D asset libraries
    - Feed rendered views into image models (img2img, upscaling)

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to render (GLB or glTF with embedded buffers) | - |
| width | `int` | Output image width in pixels | `1024` |
| height | `int` | Output image height in pixels | `1024` |
| azimuth | `float` | Horizontal camera orbit angle in degrees (0 looks along -Z) | `45` |
| elevation | `float` | Camera angle above the horizon in degrees | `25` |
| fov | `float` | Vertical field of view in degrees | `35` |
| zoom | `float` | Distance multiplier on the auto-framed camera: above 1 moves closer, below 1 farther | `1` |
| lighting | `enum` | Lighting preset: studio (key/fill/rim), soft (hemisphere), or flat (ambient only) | `studio` |
| light_intensity | `float` | Multiplier applied to all lights in the preset | `1` |
| background_color | `str` | Background color (CSS color); ignored when Transparent is on | `#ffffff` |
| transparent | `bool` | Render on a transparent background (PNG alpha) | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](./) namespace.
