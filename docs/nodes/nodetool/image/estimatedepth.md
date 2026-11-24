---
layout: page
title: "Estimate Depth"
node_type: "nodetool.image.EstimateDepth"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.EstimateDepth`

**Namespace:** `nodetool.image`

## Description

Estimate a depth map from an image. Brighter pixels are nearer to the camera.
    image, depth, depth map, 3D, estimation, AI

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `image_model` | The depth-estimation model to use | `{"type":"image_model","provider":"transformers_...` |
| image | `image` | Input image to estimate depth from | `{"type":"image","uri":"","asset_id":null,"data"...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
