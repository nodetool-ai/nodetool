---
layout: page
title: "Get Video Info"
node_type: "nodetool.video.GetVideoInfo"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.GetVideoInfo`

**Namespace:** `nodetool.video`

## Description

Get metadata information about a video file.
    Includes duration, resolution, frame rate, and codec.
    video, info, metadata, duration, resolution, fps, codec, analysis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to analyze. | `{"type":"video","uri":"","asset_id":null,"data"...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| duration | `float` |  |
| width | `int` |  |
| height | `int` |  |
| fps | `float` |  |
| frame_count | `int` |  |
| codec | `str` |  |
| has_audio | `bool` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
