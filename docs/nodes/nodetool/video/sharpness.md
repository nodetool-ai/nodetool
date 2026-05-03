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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to sharpen. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| luma_amount | `float` | Amount of sharpening to apply to luma (brightness) channel. | `1` |
| chroma_amount | `float` | Amount of sharpening to apply to chroma (color) channels. | `0.5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
