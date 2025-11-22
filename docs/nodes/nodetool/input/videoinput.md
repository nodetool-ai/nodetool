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

    Use cases:
    - Load a video file for processing or content analysis.
    - Analyze video content for events, objects, or speech.
    - Extract frames or audio tracks from a video.
    - Provide video input to models that understand video data.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `any` | The parameter name for the workflow. | `` |
| value | `any` | The video to use as input. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| description | `any` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

