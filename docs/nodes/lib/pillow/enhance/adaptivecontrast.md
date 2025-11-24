---
layout: page
title: "Adaptive Contrast"
node_type: "lib.pillow.enhance.AdaptiveContrast"
namespace: "lib.pillow.enhance"
---

**Type:** `lib.pillow.enhance.AdaptiveContrast`

**Namespace:** `lib.pillow.enhance`

## Description

Applies localized contrast enhancement using adaptive techniques.
    image, contrast, enhance

    Use cases:
    - Improve visibility in images with varying lighting conditions
    - Prepare images for improved feature detection in computer vision

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to adjust the contrast for. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| clip_limit | `float` | Clip limit for adaptive contrast. | `2.0` |
| grid_size | `int` | Grid size for adaptive contrast. | `8` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pillow.enhance](../) namespace.

