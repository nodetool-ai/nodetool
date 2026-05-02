---
layout: page
title: "Paste"
node_type: "nodetool.image.Paste"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Paste`

**Namespace:** `nodetool.image`

## Description

Paste one image onto another at specified coordinates.
    paste, composite, positioning, overlay

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to paste into. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| paste | `image` | The image to paste. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| left | `int` | The left coordinate. | `0` |
| top | `int` | The top coordinate. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.
