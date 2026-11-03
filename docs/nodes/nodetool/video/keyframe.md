---
layout: page
title: "Keyframe"
node_type: "nodetool.video.Keyframe"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Keyframe`

**Namespace:** `nodetool.video`

## Description

Pin an image to a time in a generated video. Connect several Keyframes to a keyframe model such as FLUX 3 Keyframes To Video, which passes through each image at its time.
    video, keyframe, frame, timing, interpolate, flux

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The frame the video shows at this time. | - |
| time | `float` | Seconds from the start of the video. Times past the video's duration land on its last frame. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `keyframe` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.
