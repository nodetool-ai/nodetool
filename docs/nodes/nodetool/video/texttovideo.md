---
layout: page
title: "Text To Video"
node_type: "nodetool.video.TextToVideo"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.TextToVideo`

**Namespace:** `nodetool.video`

## Description

Generate videos from text prompts using any supported video provider.
    Automatically routes to the appropriate backend (Gemini Veo, HuggingFace).
    video, generation, AI, text-to-video, t2v

    Use cases:
    - Create videos from text descriptions
    - Generate video content from prompts
    - Produce short video clips with AI
    - Switch between providers without changing workflows

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `video_model` | The video generation model to use | `{'type': 'video_model', 'provider': 'gemini', 'id': 'veo-3.0-fast-generate-001', 'name': 'Veo 3.0 Fast', 'path': None, 'supported_tasks': []}` |
| prompt | `str` | Text prompt describing the desired video | `A cat playing with a ball of yarn` |
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

