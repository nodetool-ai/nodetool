---
layout: page
title: "Render 3D Passes With Blender"
node_type: "nodetool.blender.RenderPasses"
namespace: "nodetool.blender"
---

**Type:** `nodetool.blender.RenderPasses`

**Namespace:** `nodetool.blender`

## Description

Render a 3D model (GLB/glTF) to control passes with Blender: beauty color, 16-bit or EXR depth with near/far range, camera-space normals, and a binary foreground mask.
    3d, render, depth, normal, mask, passes, controlnet, blender, camera, light

    Use cases:
    - Feed video models with camera-consistent frames and control passes from the same scene
    - Read per-pixel depth with a known near/far range
    - Mask the foreground for compositing

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
| passes | `list[str]` | Passes to produce: color (beauty), depth (view-axis distance), normal (camera-space), mask (binary foreground) | `["color","depth","normal","mask"]` |
| depth_format | `enum` | Depth encoding: png16 (normalized between depth_near and depth_far, background 65535) or exr (raw float, background +inf) | `png16` |
| timeout | `int` | Maximum render time in seconds | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| color | `image` |  |
| depth | `image` |  |
| depth_near | `float` |  |
| depth_far | `float` |  |
| normal | `image` |  |
| mask | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.blender](./) namespace.
