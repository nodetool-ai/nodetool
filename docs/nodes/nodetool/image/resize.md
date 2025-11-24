---
layout: page
title: "Resize"
node_type: "nodetool.image.Resize"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Resize`

**Namespace:** `nodetool.image`

## Description

Change image dimensions to specified width and height.
    image, resize

    - Preprocess images for machine learning model inputs
    - Optimize images for faster web page loading
    - Create uniform image sizes for layouts

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to resize. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| width | `int` | The target width. | `512` |
| height | `int` | The target height. | `512` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

