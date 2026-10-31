---
layout: page
title: "Image To Video"
node_type: "nodetool.video.ImageToVideo"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.ImageToVideo`

**Namespace:** `nodetool.video`

## Description

Animate static images into video with AI-powered motion using any supported video provider.
    video, image-to-video, i2v, animation, ai, generation, sora, veo

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `list[image]` | Input image(s) to animate. Only the first non-empty image is used as the start frame. Use Reference To Video for reference media. | `[]` |
| model | `video_model` | The video generation model to use | `{"type":"video_model","provider":"gemini","id":...` |
| prompt | `str` | Text prompt to guide the video animation. Veo animates an image without one; Kling refuses an empty one. Leaving it blank ties the graph to the models that treat it as optional. | `` |
| negative_prompt | `str` | Text prompt describing what to avoid in the video | `` |
| entities | `list[entity]` | Consistency entities (characters, styles, locations) whose descriptors are injected into the prompt | `[]` |
| aspect_ratio | `str` | Aspect ratio for the video | `16:9` |
| resolution | `str` | Video resolution | `1080p` |
| duration | `int` | Video duration in seconds | `4` |
| timeout_seconds | `int` | Timeout in seconds for API calls (0 = use provider default) | `0` |
| seed | `int` | Generation seed. Use -1 for a random seed. | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.
