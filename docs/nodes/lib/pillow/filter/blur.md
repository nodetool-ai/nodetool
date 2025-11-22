---
layout: page
title: "Blur"
node_type: "lib.pillow.filter.Blur"
namespace: "lib.pillow.filter"
---

**Type:** `lib.pillow.filter.Blur`

**Namespace:** `lib.pillow.filter`

## Description

Apply a Gaussian blur effect to an image.
    image, filter, blur

    - Soften images or reduce noise and detail
    - Make focal areas stand out by blurring surroundings
    - Protect privacy by blurring sensitive information

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to blur. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| radius | `int` | Blur radius. | `2` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pillow.filter](../) namespace.

