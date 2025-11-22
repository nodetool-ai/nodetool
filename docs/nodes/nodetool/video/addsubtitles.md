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

    Use cases:
    1. Add translations or closed captions to videos
    2. Include explanatory text or commentary in educational videos
    3. Create lyric videos for music content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `any` | The input video to add subtitles to. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| chunks | `any` | Audio chunks to add as subtitles. | `[]` |
| font | `any` | The font to use. | `{'type': 'font', 'name': ''}` |
| align | `any` | Vertical alignment of subtitles. | `bottom` |
| font_size | `any` | The font size. | `24` |
| font_color | `any` | The font color. | `{'type': 'color', 'value': '#FFFFFF'}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

