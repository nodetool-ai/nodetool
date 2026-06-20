---
layout: page
title: "Compositor"
node_type: "nodetool.image.Compositor"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Compositor`

**Namespace:** `nodetool.image`

## Description

Composite multiple image layers with per-layer opacity and blend mode.
    image, compositor, blend, layers, mask

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| layers | `list` | Per-layer state (positional): { opacity, blend_mode, visible, transform }. | `[]` |
| canvas_width | `int` | Composite canvas width in pixels. 0 → use the first visible layer's width. | `0` |
| canvas_height | `int` | Composite canvas height in pixels. 0 → use the first visible layer's height. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
