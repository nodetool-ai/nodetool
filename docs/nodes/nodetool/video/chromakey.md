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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The input video to apply chroma key effect. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| key_color | `color` | The color to key out (e.g., '#00FF00' for green). | `{"type":"color","value":"#00FF00"}` |
| similarity | `float` | Similarity threshold for the key color. | `0.3` |
| blend | `float` | Blending of the keyed area edges. | `0.1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
