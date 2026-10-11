---
layout: page
title: "Render ManimGX Scene"
node_type: "nodetool.manimgx.RenderScene"
namespace: "nodetool.manimgx"
---

**Type:** `nodetool.manimgx.RenderScene`

**Namespace:** `nodetool.manimgx`

## Description

Render a ManimGX scene, written in Python with Manim Community Edition's API, to an MP4 video. 2D and 3D math animation: equations (LaTeX or Typst), plots, geometry, surfaces and moving cameras, on a Rust GPU engine.
    manim, manimgx, animation, math, 3d, explainer, equation, latex, plot, video, python

    Use cases:
    - Animate an equation, proof or algorithm for an explainer video
    - Turn data wired into the node into an animated chart
    - Render 3D surfaces and camera moves for a title sequence

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| width | `int` | Video width in pixels (rounded up to even) | `1920` |
| height | `int` | Video height in pixels (rounded up to even) | `1080` |
| fps | `int` | Frames per second; motion keeps its timing at any rate | `30` |
| preset | `enum` | x264 encoding speed: faster presets encode sooner but write larger files | `medium` |
| crf | `float` | x264 constant rate factor: lower is higher quality and larger files | `23` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| video | `video` |  |
| storyboard | `list[image]` |  |
| report | `str` |  |
| subtitles | `str` |  |
| duration | `float` |  |

## Related Nodes

Browse other nodes in the [nodetool.manimgx](./) namespace.
