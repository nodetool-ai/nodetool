---
layout: page
title: "Sharpness"
node_type: "nodetool.video.Sharpness"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Sharpness`

**Namespace:** `nodetool.video`

## Description

Adjust the sharpness of a video.
    video, sharpen, enhance, detail

    Use cases:
    1. Enhance detail in slightly out-of-focus footage
    2. Correct softness introduced by video compression
    3. Create stylistic effects by over-sharpening

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `any` | The input video to sharpen. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| luma_amount | `any` | Amount of sharpening to apply to luma (brightness) channel. | `1.0` |
| chroma_amount | `any` | Amount of sharpening to apply to chroma (color) channels. | `0.5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

