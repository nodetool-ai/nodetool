---
layout: page
title: "Saturation"
node_type: "nodetool.video.Saturation"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Saturation`

**Namespace:** `nodetool.video`

## Description

Adjust the color saturation of a video.
    video, saturation, color, enhance

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to adjust saturation. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| saturation | `float` | Saturation level. 1.0 is original, <1 decreases saturation, >1 increases saturation. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
