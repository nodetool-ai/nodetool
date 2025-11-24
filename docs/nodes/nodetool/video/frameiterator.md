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

    Use cases:
    1. Generate image sequences for further processing
    2. Extract specific frame ranges from a video
    3. Create thumbnails or previews from video content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `video` | The input video to extract frames from. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| start | `int` | The frame to start extracting from. | `0` |
| end | `int` | The frame to stop extracting from. | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| frame | `image` |  |
| index | `int` |  |
| fps | `float` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

