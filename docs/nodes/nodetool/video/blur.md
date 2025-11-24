---
layout: page
title: "Blur"
node_type: "nodetool.video.Blur"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Blur`

**Namespace:** `nodetool.video`

## Description

Apply a blur effect to a video.
    video, blur, smooth, soften

    Use cases:
    1. Create a dreamy or soft focus effect
    2. Obscure or censor specific areas of the video
    3. Reduce noise or grain in low-quality footage

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `video` | The input video to apply blur effect. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| strength | `float` | The strength of the blur effect. Higher values create a stronger blur. | `5.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

