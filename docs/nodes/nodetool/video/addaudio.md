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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to add audio to. | - |
| audio | `audio` | The audio file to add to the video. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| volume | `float` | Volume adjustment for the added audio. 1.0 is original volume. | `1` |
| mix | `bool` | If True, mix new audio with existing. If False, replace existing audio. | `false` |
| output_length | `enum` | How long the output is. 'video' matches the picture: a longer audio track is trimmed, a shorter one padded with silence. 'longest' keeps both streams whole, so a track that outruns the picture leaves the output playing over nothing. | `video` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.
