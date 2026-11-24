---
layout: page
title: "TextToVideo"
node_type: "vertex.video.TextToVideo"
namespace: "vertex.video"
---

**Type:** `vertex.video.TextToVideo`

**Namespace:** `vertex.video`

## Description

Generate a video from a text prompt with Veo on Vertex AI, billed to your Google Cloud project.
    {...}, video, generation, veo, text-to-video

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| prompt | `str` | The text prompt describing the video to generate | `` |
| aspect_ratio | `enum` | The aspect ratio of the generated video | `16:9` |
| negative_prompt | `str` | Negative prompt to guide what to avoid in the video | `` |
| resolution | `enum` | The output video resolution | `720p` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [vertex.video](./) namespace.
