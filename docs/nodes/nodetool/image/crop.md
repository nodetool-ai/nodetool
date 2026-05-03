---
layout: page
title: "Crop"
node_type: "nodetool.image.Crop"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Crop`

**Namespace:** `nodetool.image`

## Description

Crop an image to specified coordinates.
    image, crop

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to crop. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| left | `int` | The left coordinate. | `0` |
| top | `int` | The top coordinate. | `0` |
| right | `int` | The right coordinate. | `512` |
| bottom | `int` | The bottom coordinate. | `512` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.
