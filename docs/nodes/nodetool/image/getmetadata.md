---
layout: page
title: "Get Metadata"
node_type: "nodetool.image.GetMetadata"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.GetMetadata`

**Namespace:** `nodetool.image`

## Description

Get metadata about the input image.
    metadata, properties, analysis, information

    Use cases:
    - Use width and height for layout calculations
    - Analyze image properties for processing decisions
    - Gather information for image cataloging or organization

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The input image. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| format | `str` |  |
| mode | `str` |  |
| width | `int` |  |
| height | `int` |  |
| channels | `int` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

