---
layout: page
title: "Image Segmentation"
node_type: "huggingface.image_segmentation.Segmentation"
namespace: "huggingface.image_segmentation"
---

**Type:** `huggingface.image_segmentation.Segmentation`

**Namespace:** `huggingface.image_segmentation`

## Description

Performs semantic segmentation on images, identifying and labeling different regions.
    image, segmentation, object detection, scene parsing

    Use cases:
    - Segmenting objects in images
    - Segmenting facial features in images

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.image_segmentation` | The model ID to use for the segmentation | `{'type': 'hf.image_segmentation', 'repo_id': 'nvidia/segformer-b3-finetuned-ade-512-512', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | The input image to segment | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[image_segmentation_result]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.image_segmentation](../) namespace.

