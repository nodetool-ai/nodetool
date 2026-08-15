---
layout: page
title: "For Each Frame"
node_type: "nodetool.video.ForEachFrame"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.ForEachFrame`

**Namespace:** `nodetool.video`

## Description

Extract frames from a video file with ffmpeg.
    video, frames, extract, sequence

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to extract frames from. | - |
| start | `int` | The frame to start extracting from. | `0` |
| end | `int` | The frame to stop extracting from. | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| frame | `image` |  |
| index | `int` |  |
| fps | `float` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.
