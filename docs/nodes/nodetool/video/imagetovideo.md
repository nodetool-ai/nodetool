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

    Use cases:
    - Animate static images into video sequences
    - Create dynamic content from still photographs
    - Generate video variations from reference images
    - Produce animated visual effects from static artwork
    - Convert product photos into engaging video ads

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The input image to animate into a video | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| model | `video_model` | The video generation model to use | `{'type': 'video_model', 'provider': 'gemini', 'id': 'veo-3.0-fast-generate-001', 'name': 'Veo 3.0 Fast', 'path': None, 'supported_tasks': []}` |
| prompt | `str` | Optional text prompt to guide the video animation | `` |
| negative_prompt | `str` | Text prompt describing what to avoid in the video | `` |
| aspect_ratio | `Enum['16:9', '9:16', '1:1', '4:3', '3:4']` | Aspect ratio for the video | `16:9` |
| resolution | `Enum['480p', '720p', '1080p']` | Video resolution | `720p` |
| num_frames | `int` | Number of frames to generate (provider-specific) | `60` |
| guidance_scale | `float` | Classifier-free guidance scale (higher = closer to prompt) | `7.5` |
| num_inference_steps | `int` | Number of denoising steps | `30` |
| seed | `int` | Random seed for reproducibility (-1 for random) | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

