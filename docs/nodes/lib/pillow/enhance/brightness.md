---
layout: page
title: "Brightness"
node_type: "lib.pillow.enhance.Brightness"
namespace: "lib.pillow.enhance"
---

**Type:** `lib.pillow.enhance.Brightness`

**Namespace:** `lib.pillow.enhance`

## Description

Adjusts overall image brightness to lighten or darken.
    image, brightness, enhance

    Use cases:
    - Correct underexposed or overexposed photographs
    - Enhance visibility of dark image regions
    - Prepare images for consistent display across devices

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to adjust the brightness for. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| factor | `(float | int)` | Factor to adjust the brightness. 1.0 means no change. | `1.0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pillow.enhance](../) namespace.

