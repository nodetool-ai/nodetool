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

    Use cases:
    1. Create time-lapse videos from image sequences
    2. Compile processed frames back into a video
    3. Generate animations from individual images

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| frame | `any` | Collect input frames | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| fps | `any` | The FPS of the output video. | `30` |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

