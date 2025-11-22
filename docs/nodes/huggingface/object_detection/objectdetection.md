---
layout: page
title: "Object Detection"
node_type: "huggingface.object_detection.ObjectDetection"
namespace: "huggingface.object_detection"
---

**Type:** `huggingface.object_detection.ObjectDetection`

**Namespace:** `huggingface.object_detection`

## Description

Detects and localizes objects in images.
    image, object detection, bounding boxes, huggingface

    Use cases:
    - Identify and count objects in images
    - Locate specific items in complex scenes
    - Assist in autonomous vehicle vision systems
    - Enhance security camera footage analysis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `hf.object_detection` | The model ID to use for object detection | `{'type': 'hf.object_detection', 'repo_id': 'facebook/detr-resnet-50', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `image` | The input image for object detection | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| threshold | `float` | Minimum confidence score for detected objects | `0.9` |
| top_k | `int` | The number of top predictions to return | `5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[object_detection_result]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.object_detection](../) namespace.

