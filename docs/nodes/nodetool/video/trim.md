---
layout: page
title: "Trim"
node_type: "nodetool.video.Trim"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Trim`

**Namespace:** `nodetool.video`

## Description

Trim a video to a specific start and end time.
    video, trim, cut, segment

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to trim. | - |
| start_time | `float` | The start time in seconds for the trimmed video. | `0` |
| end_time | `float` | The end time in seconds for the trimmed video. Use -1 for the end of the video. | `-1` |
| accurate | `bool` | Re-encode for frame-exact cuts. Off (default) stream-copies and snaps to the nearest keyframe — fast, but the cut points may be off by up to one GOP. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.
