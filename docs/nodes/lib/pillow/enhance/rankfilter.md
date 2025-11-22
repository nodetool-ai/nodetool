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
| image | `any` | The image to rank filter. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| size | `any` | Rank filter size. | `3` |
| rank | `any` | Rank filter rank. | `3` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pillow.enhance](../) namespace.

