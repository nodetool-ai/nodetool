---
layout: page
title: "ImageToVideo"
node_type: "vertex.video.ImageToVideo"
namespace: "vertex.video"
---

**Type:** `vertex.video.ImageToVideo`

**Namespace:** `vertex.video`

## Description

Animate an image into a video with Veo on Vertex AI, billed to your Google Cloud project.
    {...}, video, generation, veo, image-to-video

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to animate into a video | `{"type":"image","uri":"","asset_id":null,"data"...` |
| end_image | `image` | Optional frame the video ends on. Veo interpolates between the two frames in an 8-second clip. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| prompt | `str` | Optional text prompt describing the desired animation | `` |
| aspect_ratio | `enum` | The aspect ratio of the generated video | `16:9` |
| negative_prompt | `str` | Negative prompt to guide what to avoid in the video | `` |
| resolution | `enum` | The output video resolution | `720p` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [vertex.video](./) namespace.
