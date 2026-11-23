---
layout: page
title: "Render 3D Animation With Blender"
node_type: "nodetool.blender.RenderAnimation"
namespace: "nodetool.blender"
---

**Type:** `nodetool.blender.RenderAnimation`

**Namespace:** `nodetool.blender`

## Description

Render a 3D model (GLB/glTF) to a video with Blender: glTF animations play on their timeline, or the orbit camera sweeps across the frame range.
    3d, render, animation, video, camera, orbit, blender, eevee, cycles

    Use cases:
    - Turn an animated 3D model into a video
    - Sweep the camera around a static scene for a turntable clip
    - Feed camera-consistent frames into video models

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to render (GLB or glTF with embedded buffers) | - |
| camera_mode | `enum` | Whose camera renders: auto (the scene's first camera when the model has one, else an orbit camera), scene (the scene's first camera; an error when the model has none), or orbit (always an orbit camera from the props below; with no glTF animation it sweeps orbit_degrees across the range) | `auto` |
| width | `int` | Output video width in pixels | `1024` |
| height | `int` | Output video height in pixels | `1024` |
| azimuth | `float` | Horizontal camera orbit angle in degrees (0 looks along -Z) | `45` |
| elevation | `float` | Camera angle above the horizon in degrees | `25` |
| fov | `float` | Vertical field of view in degrees | `35` |
| zoom | `float` | Distance multiplier on the auto-framed camera: above 1 moves closer, below 1 farther | `1` |
| lighting | `enum` | Lighting preset used when the scene carries no lights of its own: studio (key/fill/rim), soft (hemisphere), or flat (ambient only) | `studio` |
| light_intensity | `float` | Multiplier applied to all lights in the preset; ignored when the scene carries its own lights | `1` |
| background_color | `str` | Background color (hex); ignored when Transparent is on | `#808080` |
| transparent | `bool` | Render on a transparent background (video alpha; container support varies) | `false` |
| engine | `enum` | Render engine: EEVEE (fast preview quality) or Cycles (slower, higher quality) | `eevee` |
| samples | `int` | Render samples per pixel; higher is cleaner and slower | `16` |
| denoise | `bool` | Denoise the render (Cycles; EEVEE ignores it) | `true` |
| resolution_percentage | `int` | Render scale in percent of Width × Height | `100` |
| frame_start | `int` | First frame in the glTF timeline (timestamp t seconds lands on round(t * fps)) | `1` |
| frame_end | `int` | Last frame rendered, inclusive | `24` |
| fps | `int` | Scene frames per second; glTF animation timestamps map onto this timeline | `24` |
| orbit_degrees | `float` | Camera sweep in degrees across the range when the model has no animation and Camera Mode is orbit | `360` |
| timeout | `int` | Maximum render time in seconds | `600` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| video | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.blender](./) namespace.
