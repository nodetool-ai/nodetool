---
layout: page
title: "Canny"
node_type: "lib.image.filter.Canny"
namespace: "lib.image.filter"
---

**Type:** `lib.image.filter.Canny`

**Namespace:** `lib.image.filter`

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

Browse other nodes in the [lib.image.filter](../) namespace.

