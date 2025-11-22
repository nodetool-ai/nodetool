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
| video | `any` | The input video to extract frames from. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| start | `any` | The frame to start extracting from. | `0` |
| end | `any` | The frame to stop extracting from. | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| frame | `any` |  |
| index | `any` |  |
| fps | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

