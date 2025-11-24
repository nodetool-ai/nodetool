---
layout: page
title: "Denoise"
node_type: "nodetool.video.Denoise"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Denoise`

**Namespace:** `nodetool.video`

## Description

Apply noise reduction to a video.
    video, denoise, clean, enhance

    Use cases:
    1. Improve video quality by reducing unwanted noise
    2. Enhance low-light footage
    3. Prepare video for further processing or compression

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `video` | The input video to denoise. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| strength | `float` | Strength of the denoising effect. Higher values mean more denoising. | `5.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

