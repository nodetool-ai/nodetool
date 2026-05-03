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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to adjust speed. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| speed_factor | `float` | The speed adjustment factor. Values > 1 speed up, < 1 slow down. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
