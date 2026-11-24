---
layout: page
title: "Render Timeline"
node_type: "nodetool.timeline.RenderTimeline"
namespace: "nodetool.timeline"
---

**Type:** `nodetool.timeline.RenderTimeline`

**Namespace:** `nodetool.timeline`

## Description

Render a timeline sequence to a video, composited exactly as the timeline editor previews it (tracks, transforms, transitions, effects, captions and text), with audio mixed in at each clip's offset. Writes MP4, WebM, MOV or a zipped PNG sequence, with an optional transparent background.
    timeline, render, video, export, cut, alpha

    Use cases:
    - Turn an edit assembled in the timeline editor into a shareable video
    - Export a title or lower third over transparency to composite elsewhere
    - Feed a rough cut into captioning, review, or upload nodes
    - Automate exports of timelines built by other workflow nodes

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| timeline | `timeline` | The timeline sequence to render. | `{"type":"timeline","id":null,"data":null}` |
| include_audio | `bool` | Mix audio-track clips into the rendered video. | `true` |
| format | `enum` | Output container. mp4 is H.264. webm is VP9, mov is ProRes, and png_sequence is a zip of PNGs with a manifest.json — those three carry alpha. | `mp4` |
| alpha | `bool` |  | `false` |
| video_codec | `str` | Override the container's default video encoder (mp4 only — webm pins VP9 and mov pins ProRes, the codecs that carry their alpha). Empty uses the default. | `` |
| motion_blur_samples | `int` |  | `1` |
| shutter_angle | `float` |  | - |
| bitrate | `int` | Target video bitrate in bits per second. 0 leaves the rate to the encoder. | `0` |
| preview_scale | `float` | Render at this fraction of the sequence size. 0.5 is a quarter of the pixels and roughly a quarter of the time — a draft to look at before spending on the full render. 1 is full size. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |
| frames | `document` |  |

## Related Nodes

Browse other nodes in the [nodetool.timeline](./) namespace.
