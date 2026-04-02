---
layout: page
title: "Convert To Image"
node_type: "lib.array.conversion.ConvertToImage"
namespace: "lib.array.conversion"
---

**Type:** `lib.array.conversion.ConvertToImage`

**Namespace:** `lib.array.conversion`

## Description

Convert array data to PIL Image format.
    array, image, conversion, denormalization

    Use cases:
    - Visualize array data as images
    - Save processed array results as images
    - Convert model outputs back to viewable format

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `np_array` | The input array to convert to an image. Should have either 1, 3, or 4 channels. | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.array.conversion](../) namespace.

