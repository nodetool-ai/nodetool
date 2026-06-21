---
layout: page
title: "Render Timeline"
node_type: "nodetool.timeline.RenderTimeline"
namespace: "nodetool.timeline"
---

**Type:** `nodetool.timeline.RenderTimeline`

**Namespace:** `nodetool.timeline`

## Description

Render a timeline sequence to a video (rough cut: clips are concatenated in start order, audio tracks are mixed in at their offsets).
    timeline, render, video, export, cut

    Use cases:
    - Turn an edit assembled in the timeline editor into a shareable video
    - Feed a rough cut into captioning, review, or upload nodes
    - Automate exports of timelines built by other workflow nodes

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| timeline | `timeline` | The timeline sequence to render. | `{"type":"timeline","id":null,"data":null}` |
| include_audio | `bool` | Mix audio-track clips into the rendered video. | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.timeline](./) namespace.
