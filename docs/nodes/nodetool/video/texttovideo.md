---
layout: page
title: "Text To Video"
node_type: "nodetool.video.TextToVideo"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.TextToVideo`

**Namespace:** `nodetool.video`

## Description

Generate videos from text prompts using any supported video provider. Automatically routes to the appropriate backend (Gemini Veo, HuggingFace).
    video, generation, AI, text-to-video, t2v

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `video_model` | The video generation model to use | `{"type":"video_model","provider":"gemini","id":...` |
| prompt | `str` | Text prompt describing the desired video | `A cat playing with a ball of yarn` |
| negative_prompt | `str` | Text prompt describing what to avoid in the video | `` |
| aspect_ratio | `str` | Aspect ratio for the video | `16:9` |
| resolution | `str` | Video resolution | `1080p` |
| duration | `int` | Video duration in seconds | `8` |
| timeout_seconds | `int` | Timeout in seconds for API calls (0 = use provider default) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
