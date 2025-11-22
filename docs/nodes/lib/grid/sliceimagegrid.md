---
layout: page
title: "Slice Image Grid"
node_type: "lib.grid.SliceImageGrid"
namespace: "lib.grid"
---

**Type:** `lib.grid.SliceImageGrid`

**Namespace:** `lib.grid`

## Description

Slice an image into a grid of tiles.
    image, grid, slice, tiles

    Use cases:
    - Prepare large images for processing in smaller chunks
    - Create image puzzles or mosaic effects
    - Distribute image processing tasks across multiple workers

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `any` | The image to slice into a grid. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| columns | `any` | Number of columns in the grid. | `0` |
| rows | `any` | Number of rows in the grid. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.grid](../) namespace.

