---
layout: page
title: "Image To Video"
node_type: "nodetool.video.ImageToVideo"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.ImageToVideo`

**Namespace:** `nodetool.video`

## Description

Generate videos from input images using any supported video provider.
    Animates static images into dynamic video content with AI-powered motion.
    video, image-to-video, i2v, animation, AI, generation, sora, veo

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The input image to animate into a video | `{"type":"image","uri":"","asset_id":null,"data"...` |
| model | `video_model` | The video generation model to use | `{"type":"video_model","provider":"gemini","id":...` |
| prompt | `str` | Optional text prompt to guide the video animation | `` |
| negative_prompt | `str` | Text prompt describing what to avoid in the video | `` |
| aspect_ratio | `str` | Aspect ratio for the video | `16:9` |
| resolution | `str` | Video resolution | `1080p` |
| duration | `int` | Video duration in seconds | `4` |
| timeout_seconds | `int` | Timeout in seconds for API calls (0 = use provider default) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
