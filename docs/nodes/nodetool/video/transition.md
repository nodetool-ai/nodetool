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
| video_a | `video` | The first video in the transition. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| video_b | `video` | The second video in the transition. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| transition_type | `Enum['fade', 'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'slideleft', 'slideright', 'slideup', 'slidedown', 'circlecrop', 'rectcrop', 'distance', 'fadeblack', 'fadewhite', 'radial', 'smoothleft', 'smoothright', 'smoothup', 'smoothdown', 'circleopen', 'circleclose', 'vertopen', 'vertclose', 'horzopen', 'horzclose', 'dissolve', 'pixelize', 'diagtl', 'diagtr', 'diagbl', 'diagbr', 'hlslice', 'hrslice', 'vuslice', 'vdslice', 'hblur', 'fadegrays', 'wipetl', 'wipetr', 'wipebl', 'wipebr', 'squeezeh', 'squeezev', 'zoomin', 'fadefast', 'fadeslow', 'hlwind', 'hrwind', 'vuwind', 'vdwind', 'coverleft', 'coverright', 'coverup', 'coverdown', 'revealleft', 'revealright', 'revealup', 'revealdown']` | Type of transition effect | `fade` |
| duration | `float` | Duration of the transition effect in seconds. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

