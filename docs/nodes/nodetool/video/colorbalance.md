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

    Use cases:
    1. Correct color casts in video footage
    2. Enhance specific color tones for artistic effect
    3. Normalize color balance across multiple video clips

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `video` | The input video to adjust color balance. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| red_adjust | `float` | Red channel adjustment factor. | `1.0` |
| green_adjust | `float` | Green channel adjustment factor. | `1.0` |
| blue_adjust | `float` | Blue channel adjustment factor. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

