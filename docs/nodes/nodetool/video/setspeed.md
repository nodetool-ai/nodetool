---
layout: page
title: "Set Speed"
node_type: "nodetool.video.SetSpeed"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.SetSpeed`

**Namespace:** `nodetool.video`

## Description

Adjust the playback speed of a video.
    video, speed, tempo, time

    Use cases:
    1. Create slow-motion effects by decreasing video speed
    2. Generate time-lapse videos by increasing playback speed
    3. Synchronize video duration with audio or other timing requirements

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `video` | The input video to adjust speed. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| speed_factor | `float` | The speed adjustment factor. Values > 1 speed up, < 1 slow down. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

