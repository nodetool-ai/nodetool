---
layout: page
title: "Text To Video"
node_type: "gemini.video.TextToVideo"
namespace: "gemini.video"
---

**Type:** `gemini.video.TextToVideo`

**Namespace:** `gemini.video`

## Description

Generate videos from text prompts using Google's Veo models.
    google, video, generation, text-to-video, veo, ai

    This node uses Google's Veo models to generate high-quality videos from text descriptions.
    Supports 720p resolution at 24fps with 8-second duration and native audio generation.

    Use cases:
    - Create cinematic clips from text descriptions
    - Generate social media video content
    - Produce marketing and promotional videos
    - Visualize creative concepts and storyboards
    - Create animated content with accompanying audio

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| prompt | `str` | The text prompt describing the video to generate | `` |
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

