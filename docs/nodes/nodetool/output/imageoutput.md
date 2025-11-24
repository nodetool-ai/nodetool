---
layout: page
title: "Image Output"
node_type: "nodetool.output.ImageOutput"
namespace: "nodetool.output"
---

**Type:** `nodetool.output.ImageOutput`

**Namespace:** `nodetool.output`

## Description

Output node for a single image reference ('ImageRef').
    image, picture, visual, asset, reference

    Use cases:
    - Displaying a single processed or generated image.
    - Passing image data (as an 'ImageRef') between workflow nodes.
    - Returning image analysis results encapsulated in an 'ImageRef'.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `image` |  | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| description | `str` | The description of the output for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.output](../) namespace.

