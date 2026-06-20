---
layout: page
title: "Object Detection"
node_type: "huggingface.ObjectDetection"
namespace: "huggingface"
---

**Type:** `huggingface.ObjectDetection`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Object-detection model repo id. | `facebook/detr-resnet-50` |
| image | `image` | The image to analyze. | - |
| threshold | `float` | Minimum confidence for a detection to be returned. | `0.5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
