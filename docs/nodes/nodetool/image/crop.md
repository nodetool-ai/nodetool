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

    - Remove unwanted borders from images
    - Focus on particular subjects within an image
    - Simplify images by removing distractions

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `any` | The image to crop. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| left | `any` | The left coordinate. | `0` |
| top | `any` | The top coordinate. | `0` |
| right | `any` | The right coordinate. | `512` |
| bottom | `any` | The bottom coordinate. | `512` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

