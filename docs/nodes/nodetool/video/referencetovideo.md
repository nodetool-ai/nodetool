---
layout: page
title: "Reference To Video"
node_type: "nodetool.video.ReferenceToVideo"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.ReferenceToVideo`

**Namespace:** `nodetool.video`

## Description

Generate video using ordered image and video references for identity, style, scene, motion, or audio conditioning.
    video, reference-to-video, r2v, generation, ai

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| reference_images | `list[image]` | Ordered identity, style, subject, or scene image references. | `[]` |
| reference_videos | `list[video]` | Ordered motion, scene, edit, or soundtrack video references. | `[]` |
| model | `video_model` | The reference-to-video model to use | `{"type":"video_model","provider":"","id":"","na...` |
| prompt | `str` | Describe the video using image 1, image 2, video 1, and video 2 numbering in list order. | `` |
| use_reference_video_audio | `bool` | Use audio tracks carried by reference videos where supported. | `false` |
| negative_prompt | `str` | Text prompt describing what to avoid in the video | `` |
| entities | `list[entity]` | Consistency entities whose descriptors are injected into the prompt | `[]` |
| aspect_ratio | `str` | Aspect ratio for the video | `16:9` |
| resolution | `str` | Video resolution | `1080p` |
| duration | `int` | Video duration in seconds | `5` |
| timeout_seconds | `int` | Timeout in seconds for API calls (0 = use provider default) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.
