---
layout: page
title: "Add Clips To Timeline"
node_type: "nodetool.timeline.AddClips"
namespace: "nodetool.timeline"
---

**Type:** `nodetool.timeline.AddClips`

**Namespace:** `nodetool.timeline`

## Description

Append media to a timeline sequence as clips (videos and images on the video track, audio on the audio track). Creates a new timeline when none is given.
    timeline, clips, append, assemble, storyboard

    Use cases:
    - Assemble generated shots into an editable rough cut
    - Turn a storyboard's images into an animatic
    - Add a generated voiceover or soundtrack under an edit

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| timeline | `timeline` | Timeline to append to. Leave empty to create a new timeline. | `{"type":"timeline","id":null,"data":null}` |
| clips | `list` | Media to append: image, video, and audio references. | `[]` |
| name | `str` | Name for the timeline when a new one is created. | `Untitled video` |
| image_duration_ms | `int` | Clip duration for still images, in milliseconds. | `3000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `timeline` |  |

## Related Nodes

Browse other nodes in the [nodetool.timeline](./) namespace.
