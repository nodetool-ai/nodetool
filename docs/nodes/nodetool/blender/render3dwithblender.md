---
layout: page
title: "Render 3D With Blender"
node_type: "nodetool.blender.RenderImage"
namespace: "nodetool.blender"
---

**Type:** `nodetool.blender.RenderImage`

**Namespace:** `nodetool.blender`

## Description

Render a 3D model (GLB/glTF) to an image with Blender (EEVEE or Cycles) — higher quality than the preview renderer, with scene cameras and lights honored.
    3d, render, image, camera, light, blender, eevee, cycles, snapshot, thumbnail

    Use cases:
    - Turn generated 3D models into high-quality images
    - Render a scene with its authored cameras and lights
    - Feed rendered views into image models (img2img, upscaling)

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to render (GLB or glTF with embedded buffers) | - |
| camera_mode | `enum` | Whose camera renders: auto (the scene's first camera when the model has one, else an orbit camera), scene (the scene's first camera; an error when the model has none), or orbit (always an orbit camera from the props below) | `auto` |
| width | `int` | Output image width in pixels | `1024` |
| height | `int` | Output image height in pixels | `1024` |
| azimuth | `float` | Horizontal camera orbit angle in degrees (0 looks along -Z) | `45` |
| elevation | `float` | Camera angle above the horizon in degrees | `25` |
| fov | `float` | Vertical field of view in degrees | `35` |
| zoom | `float` | Distance multiplier on the auto-framed camera: above 1 moves closer, below 1 farther | `1` |
| lighting | `enum` | Lighting preset used when the scene carries no lights of its own: studio (key/fill/rim), soft (hemisphere), or flat (ambient only) | `studio` |
| light_intensity | `float` | Multiplier applied to all lights in the preset; ignored when the scene carries its own lights | `1` |
| background_color | `str` | Background color (hex); ignored when Transparent is on | `#808080` |
| transparent | `bool` | Render on a transparent background (PNG alpha) | `false` |
| engine | `enum` | Render engine: EEVEE (fast preview quality) or Cycles (slower, higher quality) | `eevee` |
| samples | `int` | Render samples per pixel; higher is cleaner and slower | `16` |
| denoise | `bool` | Denoise the render (Cycles; EEVEE ignores it) | `true` |
| resolution_percentage | `int` | Render scale in percent of Width × Height | `100` |
| timeout | `int` | Maximum render time in seconds | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.blender](./) namespace.
