---
layout: page
title: "Blend"
node_type: "lib.image.Blend"
namespace: "lib.image"
---

**Type:** `lib.image.Blend`

**Namespace:** `lib.image`

## Description

Blend two images with adjustable alpha mixing.
    blend, mix, fade, transition

    Use cases:
    - Create smooth transitions between images
    - Adjust opacity of overlays
    - Combine multiple exposures or effects

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image1 | `image` | The first image to blend. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| image2 | `image` | The second image to blend. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| alpha | `float` | The mix ratio. | `0.5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.image](../) namespace.

