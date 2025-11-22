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

    Use cases:
    1. Create smooth transitions between video clips in a montage
    2. Add professional-looking effects to video projects
    3. Blend scenes together for creative storytelling
    4. Smoothly transition between audio tracks of different video clips

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video_a | `any` | The first video in the transition. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| video_b | `any` | The second video in the transition. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| transition_type | `any` | Type of transition effect | `fade` |
| duration | `any` | Duration of the transition effect in seconds. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

