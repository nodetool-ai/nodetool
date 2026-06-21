---
layout: page
title: "Image Size"
node_type: "nodetool.constant.ImageSize"
namespace: "nodetool.constant"
---

**Type:** `nodetool.constant.ImageSize`

**Namespace:** `nodetool.constant`

## Description

Represents a fixed image size constant in the workflow.
    constant, image_size, resolution, width, height, dimensions

    Use cases:
    - Provide fixed output dimensions for image generation nodes
    - Reference a standard resolution across the workflow
    - Expose width and height as separate integer outputs

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `image_size` |  | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image_size | `image_size` |  |
| width | `int` |  |
| height | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.constant](./) namespace.
