---
layout: page
title: "Video Input"
node_type: "nodetool.input.VideoInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.VideoInput`

**Namespace:** `nodetool.input`

## Description

Accepts a reference to a video asset for workflows, specified by a 'VideoRef'.  A 'VideoRef' points to video data that can be used for playback, analysis, frame extraction, or processing by video-capable models.
    input, parameter, video, movie, clip, visual, asset

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `video` | The video to use as input. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.
