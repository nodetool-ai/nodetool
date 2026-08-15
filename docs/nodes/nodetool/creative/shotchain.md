---
layout: page
title: "Shot Chain"
node_type: "nodetool.creative.ShotChain"
namespace: "nodetool.creative"
---

**Type:** `nodetool.creative.ShotChain`

**Namespace:** `nodetool.creative`

## Description

Animate a list of shot specs into clips sequentially, seeding each shot's first frame from the previous clip's last frame for continuity.
    creative, shots, video, continuity, chain

    Use cases:
    - Turning a storyboard's shots into a continuous animated sequence
    - Keeping motion and framing consistent across generated clips
    - Rendering a directed shot list into a cut-ready set of videos

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `video_model` | The video generation model used to animate each shot. | - |
| continuation_model | `video_model` | Model for shots seeded from the previous clip's last frame. Leave empty to reuse Model. Needed only where a provider splits text-to-video and image-to-video across different model ids — kie does (kling-2.6/text-to-video vs kling-2.6/image-to-video), Gemini/Veo does not. | `{"type":"video_model"}` |
| shots | `list[dict]` | Shot specs (from Shot Batch): each with a prompt, optional keyframe, and duration. | `[]` |
| aspect_ratio | `str` | Aspect ratio for the generated clips (e.g. 16:9, 9:16, 1:1). | `16:9` |
| resolution | `str` | Resolution for the generated clips (e.g. 720p, 1080p). | `720p` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| videos | `list[video]` |  |

## Related Nodes

Browse other nodes in the [nodetool.creative](./) namespace.
