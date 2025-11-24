---
layout: page
title: "Visualize Segmentation"
node_type: "huggingface.image_segmentation.VisualizeSegmentation"
namespace: "huggingface.image_segmentation"
---

**Type:** `huggingface.image_segmentation.VisualizeSegmentation`

**Namespace:** `huggingface.image_segmentation`

## Description

Visualizes segmentation masks on images with labels.
    image, segmentation, visualization, mask

    Use cases:
    - Visualize results of image segmentation models
    - Analyze and compare different segmentation techniques
    - Create labeled images for presentations or reports

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The input image to visualize | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| segments | `List[image_segmentation_result]` | The segmentation masks to visualize | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_segmentation](../) namespace.

