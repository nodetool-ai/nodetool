---
layout: page
title: "Concat"
node_type: "nodetool.video.Concat"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Concat`

**Namespace:** `nodetool.video`

## Description

Concatenate multiple video files into a single video, including audio when available.
    video, concat, merge, combine, audio, +

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video_a | `video` | The first video to concatenate. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| video_b | `video` | The second video to concatenate. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

