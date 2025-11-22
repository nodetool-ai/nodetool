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
| image | `any` | The input image to animate into a video | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| model | `any` | The video generation model to use | `{'type': 'video_model', 'provider': 'gemini', 'id': 'veo-3.0-fast-generate-001', 'name': 'Veo 3.0 Fast', 'path': None, 'supported_tasks': []}` |
| prompt | `any` | Optional text prompt to guide the video animation | `` |
| negative_prompt | `any` | Text prompt describing what to avoid in the video | `` |
| aspect_ratio | `any` | Aspect ratio for the video | `16:9` |
| resolution | `any` | Video resolution | `720p` |
| num_frames | `any` | Number of frames to generate (provider-specific) | `60` |
| guidance_scale | `any` | Classifier-free guidance scale (higher = closer to prompt) | `7.5` |
| num_inference_steps | `any` | Number of denoising steps | `30` |
| seed | `any` | Random seed for reproducibility (-1 for random) | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

