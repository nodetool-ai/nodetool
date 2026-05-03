---
layout: page
title: "Transition"
node_type: "nodetool.video.Transition"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Transition`

**Namespace:** `nodetool.video`

## Description

Create a transition effect between two videos, including audio transition when available.
    video, transition, effect, merge, audio

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video_a | `video` | The first video in the transition. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| video_b | `video` | The second video in the transition. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| transition_type | `enum` | Type of transition effect | `fade` |
| duration | `float` | Duration of the transition effect in seconds. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
