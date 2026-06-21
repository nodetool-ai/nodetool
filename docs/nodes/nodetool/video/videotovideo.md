---
layout: page
title: "Video To Video"
node_type: "nodetool.video.VideoToVideo"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.VideoToVideo`

**Namespace:** `nodetool.video`

## Description

Restyle or edit an existing video with a text prompt using any supported video provider.
    video, video-to-video, v2v, restyle, style-transfer, AI

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `video_model` | The video-to-video model to use | `{"type":"video_model","provider":"fal_ai","id":...` |
| video | `video` | The input video to transform | `{"type":"video","uri":"","asset_id":null,"data"...` |
| prompt | `str` | Text prompt describing the desired transformation | `` |
| negative_prompt | `str` | Text prompt describing what to avoid | `` |
| strength | `float` | How much to transform the input video | `0.6` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.
