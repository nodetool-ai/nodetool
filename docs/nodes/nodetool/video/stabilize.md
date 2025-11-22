---
layout: page
title: "Stabilize"
node_type: "nodetool.video.Stabilize"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Stabilize`

**Namespace:** `nodetool.video`

## Description

Apply video stabilization to reduce camera shake and jitter.
    video, stabilize, smooth, shake-reduction

    Use cases:
    1. Improve quality of handheld or action camera footage
    2. Smooth out panning and tracking shots
    3. Enhance viewer experience by reducing motion sickness

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `any` | The input video to stabilize. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| smoothing | `any` | Smoothing strength. Higher values result in smoother but potentially more cropped video. | `10.0` |
| crop_black | `any` | Whether to crop black borders that may appear after stabilization. | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

