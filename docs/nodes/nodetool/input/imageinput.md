---
layout: page
title: "Image Input"
node_type: "nodetool.input.ImageInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.ImageInput`

**Namespace:** `nodetool.input`

## Description

Accepts a reference to an image asset for workflows, specified by an 'ImageRef'.  An 'ImageRef' points to image data that can be used for display, analysis, or processing by vision models.
    input, parameter, image, picture, graphic, visual, asset

    Use cases:
    - Load an image for visual processing or analysis.
    - Provide an image as input to computer vision models (e.g., object detection, image classification).
    - Select an image for manipulation, enhancement, or inclusion in a document.
    - Display an image within a workflow interface.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `any` | The parameter name for the workflow. | `` |
| value | `any` | The image to use as input. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| description | `any` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

