---
layout: page
title: "TensorFlow COCO-SSD Detect"
node_type: "lib.tensorflow.CocoSsdDetect"
namespace: "lib.tensorflow"
---

**Type:** `lib.tensorflow.CocoSsdDetect`

**Namespace:** `lib.tensorflow`

## Description

Detect objects in an image using the COCO-SSD model from TensorFlow.js.
    Returns class name, score and bounding box ({x, y, width, height}) for each detection.
    tensorflow, object detection, coco, ssd, bounding box

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| max_detections | `int` | Maximum number of detections to return | `20` |
| min_score | `float` | Minimum confidence score (0–1) to keep a detection | `0.5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list` |  |

## Related Nodes

Browse other nodes in the [lib.tensorflow](../) namespace.
