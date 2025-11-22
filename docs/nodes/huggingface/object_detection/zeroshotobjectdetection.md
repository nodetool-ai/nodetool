---
layout: page
title: "Zero-Shot Object Detection"
node_type: "huggingface.object_detection.ZeroShotObjectDetection"
namespace: "huggingface.object_detection"
---

**Type:** `huggingface.object_detection.ZeroShotObjectDetection`

**Namespace:** `huggingface.object_detection`

## Description

Detects objects in images without the need for training data.
    image, object detection, bounding boxes, zero-shot, mask

    Use cases:
    - Quickly detect objects in images without training data
    - Identify objects in images without predefined labels
    - Automate object detection for large datasets

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for object detection | `{'type': 'hf.zero_shot_object_detection', 'repo_id': 'google/owlv2-base-patch16', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| image | `any` | The input image for object detection | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| threshold | `any` | Minimum confidence score for detected objects | `0.1` |
| top_k | `any` | The number of top predictions to return | `5` |
| candidate_labels | `any` | The candidate labels to detect in the image, separated by commas | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.object_detection](../) namespace.

