---
layout: page
title: "Color"
node_type: "lib.pillow.enhance.Color"
namespace: "lib.pillow.enhance"
---

**Type:** `lib.pillow.enhance.Color`

**Namespace:** `lib.pillow.enhance`

## Description

Adjusts color intensity of an image.
    image, color, enhance

    Use cases:
    - Enhance color vibrancy in photographs
    - Correct color imbalances in digital images
    - Prepare images for consistent brand color representation

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

Browse other nodes in the [lib.pillow.enhance](../) namespace.

