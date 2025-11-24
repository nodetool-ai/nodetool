---
layout: page
title: "Canny"
node_type: "lib.pillow.filter.Canny"
namespace: "lib.pillow.filter"
---

**Type:** `lib.pillow.filter.Canny`

**Namespace:** `lib.pillow.filter`

## Description

Apply Canny edge detection to an image.
    image, filter, edges

    - Highlight areas of rapid intensity change
    - Outline object boundaries and structure
    - Enhance inputs for object detection and image segmentation

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to canny. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| low_threshold | `int` | Low threshold. | `100` |
| high_threshold | `int` | High threshold. | `200` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pillow.filter](../) namespace.

