---
layout: page
title: "Scale"
node_type: "nodetool.image.Scale"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Scale`

**Namespace:** `nodetool.image`

## Description

Enlarge or shrink an image by a scale factor.
    image, resize, scale

    - Adjust image dimensions for display galleries
    - Standardize image sizes for machine learning datasets
    - Create thumbnail versions of images

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to scale. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| scale | `float` | The scale factor. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

