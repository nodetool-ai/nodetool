---
layout: page
title: "Unsharp Mask"
node_type: "lib.pillow.enhance.UnsharpMask"
namespace: "lib.pillow.enhance"
---

**Type:** `lib.pillow.enhance.UnsharpMask`

**Namespace:** `lib.pillow.enhance`

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
| image | `any` | The image to unsharp mask. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| radius | `any` | Unsharp mask radius. | `2` |
| percent | `any` | Unsharp mask percent. | `150` |
| threshold | `any` | Unsharp mask threshold. | `3` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pillow.enhance](../) namespace.

