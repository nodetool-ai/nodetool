---
layout: page
title: "Blur"
node_type: "nodetool.image.Blur"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Blur`

**Namespace:** `nodetool.image`

## Description

Blur an image — Box, Gaussian, or horizontal Motion variants.
    image, blur, gaussian, box, motion, filter

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to blur. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| blur_type | `str` | Blur algorithm: gaussian (smooth), box (boxcar), motion (horizontal streak). | `gaussian` |
| size | `int` | Blur amount (0 = none, 100 = max). | `5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
