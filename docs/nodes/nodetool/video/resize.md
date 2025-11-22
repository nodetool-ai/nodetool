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

    Use cases:
    1. Adjust video resolution for different display requirements
    2. Reduce file size by downscaling video
    3. Prepare videos for specific platforms with size constraints

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `any` | The input video to resize. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| width | `any` | The target width. Use -1 to maintain aspect ratio. | `-1` |
| height | `any` | The target height. Use -1 to maintain aspect ratio. | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

