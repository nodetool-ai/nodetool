---
layout: page
title: "Frame Iterator"
node_type: "nodetool.video.FrameIterator"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.FrameIterator`

**Namespace:** `nodetool.video`

## Description

Extract frames from a video file using OpenCV.
    video, frames, extract, sequence

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to extract frames from. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| start | `int` | The frame to start extracting from. | `0` |
| end | `int` | The frame to stop extracting from. | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| frame | `image` |  |
| index | `int` |  |
| fps | `float` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
