---
layout: page
title: "Combine Image Grid"
node_type: "lib.grid.CombineImageGrid"
namespace: "lib.grid"
---

**Type:** `lib.grid.CombineImageGrid`

**Namespace:** `lib.grid`

## Description

Combine a grid of image tiles into a single image.
    image, grid, combine, tiles

    Use cases:
    - Reassemble processed image chunks
    - Create composite images from smaller parts
    - Merge tiled image data from distributed processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| tiles | `List[image]` | List of image tiles to combine. | `[]` |
| columns | `int` | Number of columns in the grid. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.grid](../) namespace.

