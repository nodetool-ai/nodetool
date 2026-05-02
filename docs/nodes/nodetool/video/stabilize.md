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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to stabilize. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| smoothing | `float` | Smoothing strength. Higher values result in smoother but potentially more cropped video. | `10` |
| crop_black | `bool` | Whether to crop black borders that may appear after stabilization. | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
