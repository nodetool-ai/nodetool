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
| video | `video` | The input video to trim. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| start_time | `float` | The start time in seconds for the trimmed video. | `0` |
| end_time | `float` | The end time in seconds for the trimmed video. Use -1 for the end of the video. | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
