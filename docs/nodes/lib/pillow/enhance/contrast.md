---
layout: page
title: "Contrast"
node_type: "lib.image.enhance.Contrast"
namespace: "lib.image.enhance"
---

**Type:** `lib.image.enhance.Contrast`

**Namespace:** `lib.image.enhance`

## Description

Adjusts image contrast to modify light-dark differences.
    image, contrast, enhance

    Use cases:
    - Enhance visibility of details in low-contrast images
    - Prepare images for visual analysis or recognition tasks
    - Create dramatic effects in artistic photography

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

