---
layout: page
title: "Convert To Array"
node_type: "lib.array.conversion.ConvertToArray"
namespace: "lib.array.conversion"
---

**Type:** `lib.array.conversion.ConvertToArray`

**Namespace:** `lib.array.conversion`

## Description

Convert PIL Image to normalized tensor representation.
    image, tensor, conversion, normalization

    Use cases:
    - Prepare images for machine learning models
    - Convert between image formats for processing
    - Normalize image data for consistent calculations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The input image to convert to a tensor. The image should have either 1 (grayscale), 3 (RGB), or 4 (RGBA) channels. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `np_array` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.array.conversion](../) namespace.

