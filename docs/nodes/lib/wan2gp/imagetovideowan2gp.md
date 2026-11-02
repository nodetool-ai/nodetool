---
layout: page
title: "Image To Video (Wan2GP)"
node_type: "lib.wan2gp.ImageToVideo"
namespace: "lib.wan2gp"
---

**Type:** `lib.wan2gp.ImageToVideo`

**Namespace:** `lib.wan2gp`

## Description

Animate a still image with a Wan image-to-video model on your own Wan2GP server.
    video, generation, image-to-video, animation, Wan, Wan2GP, local

    Use cases:
    - Animate a photograph or a piece of artwork
    - Add camera movement to a product shot
    - Test motion prompts against one fixed first frame

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The first frame of the video. | null |
| prompt | `str` | How the image should move. | `` |
| model_type | `str` | Wan2GP model id, for example i2v_2_2. The List Models node shows the ids your server offers. | `i2v_2_2` |

## Outputs

_(none)_

## Related Nodes

Browse other nodes in the [lib.wan2gp](./) namespace.
