---
layout: page
title: "Get Channel"
node_type: "lib.image.filter.GetChannel"
namespace: "lib.image.filter"
---

**Type:** `lib.image.filter.GetChannel`

**Namespace:** `lib.image.filter`

## Description

Extract a specific color channel from an image.
    image, color, channel, isolate, extract

    - Isolate color information for image analysis
    - Manipulate specific color components in graphic design
    - Enhance or reduce visibility of certain colors

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to get the channel from. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| channel | `Enum['R', 'G', 'B']` |  | `R` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.image.filter](../) namespace.

