---
layout: page
title: "Sharpness"
node_type: "lib.image.enhance.Sharpness"
namespace: "lib.image.enhance"
---

**Type:** `lib.image.enhance.Sharpness`

**Namespace:** `lib.image.enhance`

## Description

Adjusts image sharpness to enhance or reduce detail clarity.
    image, clarity, sharpness

    Use cases:
    - Enhance photo details for improved visual appeal
    - Refine images for object detection tasks
    - Correct slightly blurred images

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to adjust the brightness for. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| factor | `float` | Factor to adjust the contrast. 1.0 means no change. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.image.enhance](../) namespace.

