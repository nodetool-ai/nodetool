---
layout: page
title: "Add Subtitles"
node_type: "nodetool.video.AddSubtitles"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.AddSubtitles`

**Namespace:** `nodetool.video`

## Description

Add subtitles to a video.
    video, subtitles, text, caption

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to add subtitles to. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| chunks | `list[audio_chunk]` | Audio chunks to add as subtitles. | `[]` |
| font | `font` | The font to use. | `{"type":"font","name":"","source":"system","url...` |
| align | `enum` | Vertical alignment of subtitles. | `bottom` |
| font_size | `int` | The font size. | `24` |
| font_color | `color` | The font color. | `{"type":"color","value":"#FFFFFF"}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
