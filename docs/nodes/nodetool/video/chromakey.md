---
layout: page
title: "Chroma Key"
node_type: "nodetool.video.ChromaKey"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.ChromaKey`

**Namespace:** `nodetool.video`

## Description

Apply chroma key (green screen) effect to a video.
    video, chroma key, green screen, compositing

    Use cases:
    1. Remove green or blue background from video footage
    2. Create special effects by compositing video onto new backgrounds
    3. Produce professional-looking videos for presentations or marketing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `any` | The input video to apply chroma key effect. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| key_color | `any` | The color to key out (e.g., '#00FF00' for green). | `{'type': 'color', 'value': '#00FF00'}` |
| similarity | `any` | Similarity threshold for the key color. | `0.3` |
| blend | `any` | Blending of the keyed area edges. | `0.1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

