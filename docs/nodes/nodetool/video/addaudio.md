---
layout: page
title: "Add Audio"
node_type: "nodetool.video.AddAudio"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.AddAudio`

**Namespace:** `nodetool.video`

## Description

Add an audio track to a video, replacing or mixing with existing audio.
    video, audio, soundtrack, merge

    Use cases:
    1. Add background music or narration to a silent video
    2. Replace original audio with a new soundtrack
    3. Mix new audio with existing video sound

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `video` | The input video to add audio to. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| audio | `audio` | The audio file to add to the video. | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| volume | `float` | Volume adjustment for the added audio. 1.0 is original volume. | `1.0` |
| mix | `bool` | If True, mix new audio with existing. If False, replace existing audio. | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

