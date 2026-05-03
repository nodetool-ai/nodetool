---
layout: page
title: "Extract Frame"
node_type: "nodetool.video.ExtractFrame"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.ExtractFrame`

**Namespace:** `nodetool.video`

## Description

Extract a single frame from a video at a specific time position.
    video, frame, extract, screenshot, thumbnail, capture

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to extract a frame from. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| time | `float` | Time position in seconds to extract the frame from. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
