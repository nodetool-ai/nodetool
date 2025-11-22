---
layout: page
title: "Rank Filter"
node_type: "lib.pillow.enhance.RankFilter"
namespace: "lib.pillow.enhance"
---

**Type:** `lib.pillow.enhance.RankFilter`

**Namespace:** `lib.pillow.enhance`

## Description

Applies rank-based filtering to enhance or smooth image features.
    image, filter, enhance

    Use cases:
    - Reduce noise while preserving edges in images
    - Enhance specific image features based on local intensity
    - Pre-process images for improved segmentation results

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to rank filter. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| size | `int` | Rank filter size. | `3` |
| rank | `int` | Rank filter rank. | `3` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pillow.enhance](../) namespace.

