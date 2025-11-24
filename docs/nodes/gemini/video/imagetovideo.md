---
layout: page
title: "Image To Video"
node_type: "gemini.video.ImageToVideo"
namespace: "gemini.video"
---

**Type:** `gemini.video.ImageToVideo`

**Namespace:** `gemini.video`

## Description

Generate videos from images using Google's Veo models.
    google, video, generation, image-to-video, veo, ai, animation

    This node uses Google's Veo models to animate static images into dynamic videos.
    Supports 720p resolution at 24fps with 8-second duration and native audio generation.

    Use cases:
    - Animate still artwork and photographs
    - Create dynamic social media content from images
    - Generate product showcase videos from photos
    - Transform static graphics into engaging animations
    - Create video presentations from slide images

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to animate into a video | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| prompt | `str` | Optional text prompt describing the desired animation | `` |
| model | `Enum['veo-3.0-generate-preview', 'veo-3.0-fast-generate-preview', 'veo-2.0-generate-001']` | The Veo model to use for video generation | `veo-3.0-generate-preview` |
| aspect_ratio | `Enum['16:9', '9:16']` | The aspect ratio of the generated video | `16:9` |
| negative_prompt | `str` | Negative prompt to guide what to avoid in the video | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [gemini.video](../) namespace.

