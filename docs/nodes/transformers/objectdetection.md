---
layout: page
title: "Object Detection"
node_type: "transformers.ObjectDetection"
namespace: "transformers"
---

**Type:** `transformers.ObjectDetection`

**Namespace:** `transformers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | Image to run detection on. | `{"type":"image"}` |
| model | `any` | Transformers.js model (ONNX-compatible). | - |
| threshold | `float` | Minimum confidence score required to keep a detection. | `0.9` |
| percentage | `bool` | Return bounding boxes as fractions of image size. | `true` |
| dtype | `enum` | Model dtype / quantization level. | `auto` |
| device | `enum` | Inference device. | `auto` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| detections | `list` |  |

## Related Nodes

Browse other nodes in the [transformers](./) namespace.
