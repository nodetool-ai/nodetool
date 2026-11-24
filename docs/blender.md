---
layout: page
title: "Blender Nodes"
permalink: /blender
description: "Render 3D models to images, passes and video, and prepare or convert meshes, with headless Blender inside a workflow."
---

The Blender nodes render and convert 3D models by running Blender in the background. Every node takes a 3D model (GLB, or glTF with embedded data) and returns an image, a video, a set of control images, or a model file.

> **Requires:** Blender 5.2 or newer, installed on the machine that runs the NodeTool server. NodeTool does not bundle it. **Runs:** locally, on the desktop app, a local server, or a self-hosted install. Off on cloud deployments. **Needs:** no API key.
{: .callout-note}

Scene cameras and lights are honored, and you can pick EEVEE or Cycles. The [3D Editor](3d-editor.md) assistant uses the same Blender install to render shots.

## Set up Blender

Install Blender from [blender.org](https://www.blender.org/download/) or your system package manager. An older version fails with an error that names the version found and the minimum.

NodeTool tries these places in order and uses the first one that answers `--version`:

1. A Blender path saved in your settings. It is ignored on cloud deployments.
2. The `BLENDER_PATH` environment variable.
3. `blender` on your `PATH`.
4. The usual install location for your system.

| System | Locations checked |
|--------|-------------------|
| macOS | `/Applications/Blender.app/Contents/MacOS/Blender` |
| Linux | `/usr/bin/blender` and `/snap/bin/blender` |
| Windows | `blender.exe` in each `Blender*` folder under `Blender Foundation` in Program Files and Program Files (x86), newest first |

If Blender is installed somewhere else, set `BLENDER_PATH` to the executable itself, not to its folder:

```bash
export BLENDER_PATH=/opt/blender-5.2/blender
```

NodeTool remembers the result while the server runs and looks again when `BLENDER_PATH` changes. If nothing is found, the node fails before it renders with the error "blender was not found". When `BLENDER_PATH` points at a file that does not run, the error includes the reason.

A server without Blender can send the job to a NodeTool worker that has Blender enabled, when `NODETOOL_WORKER_URL` names that worker (see [Environment Variables](environment-variables.md)). A Blender found on the local machine always wins over a worker.

## Common properties

`RenderImage`, `RenderAnimation`, and `RenderPasses` share one block of camera, lighting, and engine properties.

| Property | Default | What it does |
|----------|---------|--------------|
| Model | none | The 3D model to render |
| Camera Mode | `auto` | `auto` uses the scene's first camera and falls back to an orbit camera. `scene` requires a camera in the model. `orbit` always uses the orbit camera |
| Width, Height | 1024 | Output size in pixels, 16 to 4096 |
| Azimuth | 45 | Horizontal orbit angle in degrees |
| Elevation | 25 | Camera angle above the horizon, -89 to 89 |
| Field of View | 35 | Vertical field of view in degrees |
| Zoom | 1 | Above 1 moves the camera closer, below 1 farther |
| Lighting | `studio` | `studio`, `soft`, or `flat`. Used only when the scene has no lights |
| Light Intensity | 1 | Multiplier for the preset lights |
| Background Color | `#808080` | Hex color, ignored when Transparent is on |
| Transparent | Off | Render with an alpha channel |
| Engine | `eevee` | `eevee` is fast. `cycles` is slower and cleaner |
| Samples | 16 | Samples per pixel |
| Denoise | On | Applies to Cycles only |
| Resolution Percentage | 100 | Render scale as a percent of Width by Height |
| Timeout | 600 | Maximum seconds before the job stops, 1 to 3600 |

The default background is gray because a white model on a white background is invisible.

## Nodes

| Node | Inputs | Outputs |
|------|--------|---------|
| Render 3D With Blender (`RenderImage`) | Model and the common properties | `image` |
| Render 3D Animation With Blender (`RenderAnimation`) | Model, the common properties, Frame Start, Frame End, FPS, Orbit Degrees | `video` |
| Render 3D Passes With Blender (`RenderPasses`) | Model, the common properties, Passes, Depth Format | `color`, `depth`, `depth_near`, `depth_far`, `normal`, `mask` |
| Prepare 3D Model For Engine (`PrepareForEngine`) | Model, Target Faces, Unwrap, Bake, Bake Resolution, LOD Count, Timeout | `model`, `lods` |
| Export 3D Model With Blender (`ExportModel`) | Model, Format, Timeout | `file` |

### RenderImage

Renders one frame and returns it as an image. Connect it to any image node, such as an image-to-image or upscale model.

### RenderAnimation

Renders a frame range to an MP4 video. If the model has glTF animations, they play on the timeline. If it has none and Camera Mode is `orbit`, the camera sweeps around the model.

| Property | Default | What it does |
|----------|---------|--------------|
| Frame Start | 1 | First frame |
| Frame End | 24 | Last frame, inclusive |
| FPS | 24 | Frames per second. glTF animation times map onto this timeline |
| Orbit Degrees | 360 | Camera sweep across the range when the model has no animation and Camera Mode is `orbit` |

Timeout is 600 seconds by default. For a turntable clip, use a static model, `orbit`, and the default 360 degrees.

### RenderPasses

Renders extra images of the same view, called passes. Each pass shows one property of the scene, and all passes share the camera, so they line up pixel for pixel. Use them to guide image and video models or to composite.

| Pass | What it is for |
|------|----------------|
| `color` | The finished picture. The base image for compositing or for a model's reference input |
| `depth` | How far each pixel is from the camera. Use it for fog or depth of field in compositing, or as a depth-guided ControlNet input |
| `normal` | The direction each surface faces. Use it for relighting, or as a normal-guided ControlNet input |
| `mask` | White where the model is, black elsewhere. Use it to cut the model out and place it on another background |

| Property | Default | What it does |
|----------|---------|--------------|
| Passes | color, depth, normal, mask | Which passes to produce. Select at least one |
| Depth Format | `png16` | `png16` for a standard image file, `exr` for exact distances. See [Pass formats](#pass-formats) |

Passes you do not request come back empty. `depth_near` and `depth_far` give the real distance range of the depth image and are 0 when depth is not requested.

### PrepareForEngine

Cleans up a mesh for a game engine and returns it as a GLB.

| Property | Default | What it does |
|----------|---------|--------------|
| Target Faces | 5000 | Face budget per mesh. Meshes already under it are left alone |
| Unwrap | On | Lay out the texture coordinates (UVs) of every mesh before baking |
| Bake | `none` | Which maps to bake into the materials: `none`, `ao`, `normal`, or `both`. See [Pass formats](#pass-formats) |
| Bake Resolution | 1024 | Pixel size of each baked map |
| LOD Count | 0 | Extra levels of detail, 0 to 8. Each halves the face count of the one before |

`model` is the prepared model. `lods` is a list with one model per level of detail, in order.

### ExportModel

Converts a model to a format Blender writes and stores it as an asset.

| Format | Notes |
|--------|-------|
| `fbx` (default) | For game engines |
| `obj` | Geometry only, with no `.mtl` file |
| `usd` | For USD pipelines |

The output `file` is an asset. Its metadata records the format and file type. To keep a GLB, use PrepareForEngine instead.

## Example: turntable video and an FBX

1. Add a `nodetool.constant.Model3D` node and choose a GLB asset. See [3D Editor](3d-editor.md#using-a-model-elsewhere).
2. Connect it to **Render 3D Animation With Blender**. Set Engine to `eevee`, Width 1280, Height 720, Frame Start 1, Frame End 120, FPS 24. Keep Camera Mode on `orbit`.
3. Connect the `video` output to a save or video node. The result is a five-second turntable.
4. Connect the same model to **Export 3D Model With Blender** with Format `fbx` to get a file for a game engine.

## Limits and errors

- A render that exceeds its Timeout fails with a message that suggests lowering samples, using EEVEE, or raising the timeout.
- An empty model input fails with "model input is empty".
- A node never returns an empty result silently. A missing Blender, an old version, or a missing output each raise an error that names the cause.

## Pass formats

| Output | Format |
|--------|--------|
| `color`, `normal`, `mask` | PNG |
| `depth` with `png16` | 16-bit PNG, normalized between `depth_near` and `depth_far`. Background pixels are 65535 |
| `depth` with `exr` | EXR with raw float distances. Background pixels are infinity |
| `depth_near`, `depth_far` | Floats, the real distance range of the depth image |

- `depth` is the distance along the view axis.
- `normal` is in camera space.
- `mask` is binary: foreground or background.
- Bake `ao` multiplies ambient occlusion into the base color. Bake `normal` writes a tangent-space normal map.
