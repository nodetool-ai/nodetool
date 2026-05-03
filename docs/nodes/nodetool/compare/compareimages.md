---
layout: page
title: "Compare Images"
node_type: "nodetool.compare.CompareImages"
namespace: "nodetool.compare"
---

**Type:** `nodetool.compare.CompareImages`

**Namespace:** `nodetool.compare`

## Description

Compare two images side-by-side with an interactive slider.
    image, compare, comparison, diff, before, after, slider

    Use this node to visually compare:
    - Before/after processing results
    - Different model outputs
    - Original vs edited images
    - A/B testing of image variations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image_a | `image` | First image (displayed on left/top) | `{"type":"image","uri":"","asset_id":null,"data"...` |
| image_b | `image` | Second image (displayed on right/bottom) | `{"type":"image","uri":"","asset_id":null,"data"...` |
| label_a | `str` | Label for the first image | `A` |
| label_b | `str` | Label for the second image | `B` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `none` |  |

## Related Nodes

Browse other nodes in the [nodetool.compare](../) namespace.
