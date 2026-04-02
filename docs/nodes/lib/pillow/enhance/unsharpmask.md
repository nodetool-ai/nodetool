---
layout: page
title: "Unsharp Mask"
node_type: "lib.image.enhance.UnsharpMask"
namespace: "lib.image.enhance"
---

**Type:** `lib.image.enhance.UnsharpMask`

**Namespace:** `lib.image.enhance`

## Description

Sharpens images using the unsharp mask technique.
    image, sharpen, enhance

    Use cases:
    - Enhance edge definition in photographs
    - Improve perceived sharpness of digital artwork
    - Prepare images for high-quality printing or display

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to unsharp mask. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| radius | `int` | Unsharp mask radius. | `2` |
| percent | `int` | Unsharp mask percent. | `150` |
| threshold | `int` | Unsharp mask threshold. | `3` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.image.enhance](../) namespace.

