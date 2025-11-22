---
layout: page
title: "SAM2 Segmentation"
node_type: "huggingface.image_segmentation.SAM2Segmentation"
namespace: "huggingface.image_segmentation"
---

**Type:** `huggingface.image_segmentation.SAM2Segmentation`

**Namespace:** `huggingface.image_segmentation`

## Description

Performs semantic segmentation on images using SAM2 (Segment Anything Model 2).
    image, segmentation, object detection, scene parsing, mask

    Use cases:
    - Automatic segmentation of objects in images
    - Instance segmentation for computer vision tasks
    - Interactive segmentation with point prompts
    - Scene understanding and object detection

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The input image to segment | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[image]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_segmentation](../) namespace.

