---
layout: page
title: "Rotate"
node_type: "nodetool.video.Rotate"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Rotate`

**Namespace:** `nodetool.video`

## Description

Rotate a video by a specified angle.
    video, rotate, orientation, transform

    Use cases:
    1. Correct orientation of videos taken with a rotated camera
    2. Create artistic effects by rotating video content
    3. Adjust video for different display orientations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `any` | The input video to rotate. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| angle | `any` | The angle of rotation in degrees. | `0.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

