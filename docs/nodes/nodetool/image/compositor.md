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
| layers | `list` | Per-layer state (positional): { opacity, blend_mode, visible }. | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
