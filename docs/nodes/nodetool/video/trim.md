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

    Use cases:
    1. Extract specific segments from a longer video
    2. Remove unwanted parts from the beginning or end of a video
    3. Create shorter clips from a full-length video

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `any` | The input video to trim. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| start_time | `any` | The start time in seconds for the trimmed video. | `0.0` |
| end_time | `any` | The end time in seconds for the trimmed video. Use -1 for the end of the video. | `-1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

