---
layout: page
title: "Overlay"
node_type: "nodetool.video.Overlay"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Overlay`

**Namespace:** `nodetool.video`

## Description

Overlay one video on top of another, including audio overlay when available.
    video, overlay, composite, picture-in-picture, audio

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| main_video | `any` | The main (background) video. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| overlay_video | `any` | The video to overlay on top. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| x | `any` | X-coordinate for overlay placement. | `0` |
| y | `any` | Y-coordinate for overlay placement. | `0` |
| scale | `any` | Scale factor for the overlay video. | `1.0` |
| overlay_audio_volume | `any` | Volume of the overlay audio relative to the main audio. | `0.5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

