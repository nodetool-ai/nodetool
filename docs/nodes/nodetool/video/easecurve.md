---
layout: page
title: "Ease Curve"
node_type: "nodetool.video.EaseCurve"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.EaseCurve`

**Namespace:** `nodetool.video`

## Description

Retime a video along an easing curve so playback speeds up or slows down smoothly. Ease in starts slow and ends fast, ease out the reverse. The whole source plays once, over the output duration.
    video, speed, ramp, retime, ease, curve, slow motion, time remap

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to retime. | - |
| easing | `enum` | The speed curve. Choose custom to set cubic-bezier control points. | `easeInOut` |
| duration | `float` | Output length in seconds. 0 keeps the source length. | `0` |
| x1 | `float` | First cubic-bezier control point, x (0 to 1). | `0.42` |
| y1 | `float` | First cubic-bezier control point, y (0 to 1). | `0` |
| x2 | `float` | Second cubic-bezier control point, x (0 to 1). | `0.58` |
| y2 | `float` | Second cubic-bezier control point, y (0 to 1). | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.
