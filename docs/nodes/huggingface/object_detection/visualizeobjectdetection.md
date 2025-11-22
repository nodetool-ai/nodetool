---
layout: page
title: "Visualize Object Detection"
node_type: "huggingface.object_detection.VisualizeObjectDetection"
namespace: "huggingface.object_detection"
---

**Type:** `huggingface.object_detection.VisualizeObjectDetection`

**Namespace:** `huggingface.object_detection`

## Description

Visualizes object detection results on images.
    image, object detection, bounding boxes, visualization, mask

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The input image to visualize | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| objects | `List[object_detection_result]` | The detected objects to visualize | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.object_detection](../) namespace.

