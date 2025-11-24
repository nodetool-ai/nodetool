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

    Use cases:
    1. Enhance color vibrancy in dull or flat-looking footage
    2. Create stylistic effects by over-saturating or desaturating video
    3. Correct oversaturated footage from certain cameras

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `video` | The input video to adjust saturation. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| saturation | `float` | Saturation level. 1.0 is original, <1 decreases saturation, >1 increases saturation. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

