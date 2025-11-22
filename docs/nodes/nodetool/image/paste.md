---
layout: page
title: "Paste"
node_type: "nodetool.image.Paste"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.Paste`

**Namespace:** `nodetool.image`

## Description

Paste one image onto another at specified coordinates.
    paste, composite, positioning, overlay

    Use cases:
    - Add watermarks or logos to images
    - Combine multiple image elements
    - Create collages or montages

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `any` | The image to paste into. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| paste | `any` | The image to paste. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| left | `any` | The left coordinate. | `0` |
| top | `any` | The top coordinate. | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

