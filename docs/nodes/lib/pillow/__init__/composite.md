---
layout: page
title: "Composite"
node_type: "lib.image.Composite"
namespace: "lib.image"
---

**Type:** `lib.image.Composite`

**Namespace:** `lib.image`

## Description

Combine two images using a mask for advanced compositing.
    composite, mask, blend, layering

    Use cases:
    - Create complex image compositions
    - Apply selective blending or effects
    - Implement advanced photo editing techniques

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image1 | `image` | The first image to composite. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| image2 | `image` | The second image to composite. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| mask | `image` | The mask to composite with. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.image](../) namespace.

