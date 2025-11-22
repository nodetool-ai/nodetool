---
layout: page
title: "Fit"
node_type: "nodetool.image.Fit"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Fit`

**Namespace:** `nodetool.image`

## Description

Resize an image to fit within specified dimensions while preserving aspect ratio.
    image, resize, fit

    - Resize images for online publishing requirements
    - Preprocess images to uniform sizes for machine learning
    - Control image display sizes for web development

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to fit. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| width | `int` | Width to fit to. | `512` |
| height | `int` | Height to fit to. | `512` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

