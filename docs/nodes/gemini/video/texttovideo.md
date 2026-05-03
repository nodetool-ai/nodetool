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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | The text prompt describing the video to generate | `` |
| model | `enum` | The Veo model to use for video generation | `veo-3.1-generate-preview` |
| aspect_ratio | `enum` | The aspect ratio of the generated video | `16:9` |
| negative_prompt | `str` | Negative prompt to guide what to avoid in the video | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [gemini.video](../) namespace.
