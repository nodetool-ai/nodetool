---
layout: page
title: "Color Balance"
node_type: "nodetool.video.ColorBalance"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.ColorBalance`

**Namespace:** `nodetool.video`

## Description

Adjust the color balance of a video.
    video, color, balance, adjustment

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to adjust color balance. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| red_adjust | `float` | Red channel adjustment factor. | `1` |
| green_adjust | `float` | Green channel adjustment factor. | `1` |
| blue_adjust | `float` | Blue channel adjustment factor. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
