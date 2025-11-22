---
layout: page
title: "Convert To Image"
node_type: "lib.numpy.conversion.ConvertToImage"
namespace: "lib.numpy.conversion"
---

**Type:** `lib.numpy.conversion.ConvertToImage`

**Namespace:** `lib.numpy.conversion`

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
| values | `any` | The input array to convert to an image. Should have either 1, 3, or 4 channels. | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.numpy.conversion](../) namespace.

