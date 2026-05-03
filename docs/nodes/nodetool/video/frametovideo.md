---
layout: page
title: "Frame To Video"
node_type: "nodetool.video.FrameToVideo"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.FrameToVideo`

**Namespace:** `nodetool.video`

## Description

Combine a sequence of frames into a single video file.
    video, frames, combine, sequence

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| frame | `image` | Collect input frames | `{"type":"image","uri":"","asset_id":null,"data"...` |
| fps | `float` | The FPS of the output video. | `30` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
