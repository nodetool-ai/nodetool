---
layout: page
title: "Resize"
node_type: "nodetool.video.Resize"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Resize`

**Namespace:** `nodetool.video`

## Description

Resize a video to a specific width and height.
    video, resize, scale, dimensions

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to resize. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| width | `int` | The target width. Use -1 to maintain aspect ratio. | `-1` |
| height | `int` | The target height. Use -1 to maintain aspect ratio. | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
